## Plan: Fix 6 Core CRM Issues

I verified each issue against the live database and code. Findings drive a small, surgical fix set. No RLS changes, no `index.html` edits, no `useTasks.ts` schema/contract breakage.

---

### Issue 1 — Stale "Latest Activity" on profile cards

**Root cause confirmed:**

- `LeadProfileTab.tsx`: fetches latest activity once on mount, only re-fetches when the user changes status from inside the same tab. Other activity (task snoozes, task updates, etc.) never triggers a refresh.
- `CustomerProfileTab.tsx`: even worse — the "Latest Activity" section is **hardcoded** to show "Customer created" with `customer.created_at`. It never reads from `activity_log` at all.

**Fix:**

- Both tabs subscribe to Supabase Realtime on `activity_log` filtered by `lead_id` / `customer_id` and re-fetch the most recent row on INSERT.
- Customer tab: replace the hardcoded "Customer created" section with the same query + display pattern used by `LeadProfileTab` (activity_type → friendly label, user_name, relative time).
- Add `activity_log` to the `supabase_realtime` publication via SQL migration.

---

### Issue 2 — Lead/Customer task counts, overdue badges, and follow-up dates not updating

**Root cause confirmed:**

- DB has `update_lead_followup_dates()` function, **but no trigger uses it** (`information_schema.triggers` is empty for `public`).
- `syncLeadFollowUpDates` exists in `useTasks.ts` and is called for Add/Update/Snooze/Delete — but it only handles **leads**, never customers.
- No equivalent customer sync exists, so customer `last_follow_up` / `next_follow_up` stay null forever.
- `tasks` is **not in the `supabase_realtime` publication**, so even when one user updates a task, other tabs/users don't see counts/badges refresh in real time.
- Follow-up dates can also drift when tasks are mutated by automations or other paths that bypass `useTasks`.

**Fix:**

1. SQL migration:
  - Generalize `update_lead_followup_dates` into a single trigger function that handles **both** `leads` (via `tasks.lead_id`) and **customers** (via `tasks.related_entity_type='customer' AND tasks.related_entity_id`).
  - Attach an `AFTER INSERT OR UPDATE OR DELETE` trigger on `tasks` that calls it. This guarantees follow-up dates stay in sync no matter what code path mutates tasks (UI, automation, restore, API).
  - Add `tasks`, `leads`, `customers`, `activity_log`, `reminders` to the `supabase_realtime` publication.
2. Frontend:
  - Add a customer-side `syncCustomerFollowUpDates` helper in `useTasks.ts` mirroring the lead one (belt-and-braces; the trigger is the source of truth, but immediate optimistic UI helps).
  - `useLeads.ts` / `useCustomers.ts`: subscribe to the `tasks` realtime channel and invalidate/refetch on change so badges and dates refresh without page reload.
  - `usePendingTasksByLead` / `usePendingTasksByCustomer` already subscribe to `tasks` — just need the publication entry to actually fire.

---

### Issue 3 — Reminders tab incomplete

**Root cause confirmed:**

- `LeadRemindersTab` and `ProfessionalDetailView` already pull task reminders from `tasks` rows, but only show task fields (not actual `reminders` table rows targeting that task).
- `CustomerRemindersTab` shows nothing for tasks at all.
- None of them combine entity-direct reminders + task-table reminders + `reminders`-rows-where-`entity_type='task'-and-task-belongs-to-this-entity`.

**Fix:**
Refactor each of the three tab files to render a single unified, sorted list:

- Entity-direct reminders: `useReminders(entityType, entity.id)` (already wired).
- Task-derived reminders: tasks linked to this entity that have `reminder=true` AND/OR have a row in `reminders` with `entity_type='task'` and `entity_id` in the entity's task IDs.
- Each task-sourced row carries a small "Task: &nbsp;" sub-label so the user knows the source.
- Sort: active (non-snoozed) first, then by `reminder_datetime`/computed fire time ascending.
- Apply this to: `LeadRemindersTab.tsx`, `CustomerRemindersTab.tsx`, and the Reminders tab section of `ProfessionalDetailView.tsx`.

---

### Issue 4 — Bell never fires for task reminders (THE big one)

**Root cause confirmed:**

- `AddTaskDialog` and `EditTaskDialog` only set `reminder` (bool) and `reminder_time` ("15"/"30"/"60"/"1440" — minutes before due) on the `tasks` row.
- **No corresponding row is ever inserted into the `reminders` table.**
- `useReminders` / `NotificationDropdown` / unread count read **exclusively from the `reminders` table**.
- Result: the bell can never fire for task reminders — they don't exist as reminder records.

**Fix (the definitive one):**
Move the mirroring into `useTasks.ts` so it works for *every* code path that creates/updates/deletes tasks (Add dialog, Edit dialog, bulk add, automation engine on the client, KIT linked tasks). New helper `syncTaskReminder(task)` runs after every successful add/update/snooze/complete/delete:

- Compute `fire_at = (task.due_date + task.due_time) − reminder_time minutes`. If `due_time` is missing, treat as 09:00 local.
- If `task.reminder === true` and task is not Completed/Cancelled and `fire_at` is in the future:
  - Upsert one `reminders` row (`entity_type='task'`, `entity_id=task.id`) with that `reminder_datetime`, `title="Reminder: <task.title>"`, `assigned_to=task.assigned_to`.
- If `task.reminder === false`, OR task becomes Completed/Cancelled, OR task is deleted: hard-delete the matching `reminders` row(s) for `entity_type='task' entity_id=task.id`.
- If `due_date` / `due_time` / `reminder_time` change while reminder stays enabled: update `reminder_datetime` on the existing row and clear `is_snoozed` so it can fire fresh.

This makes the bell fire reliably within ≤60s (existing 60s polling already in `useReminders`), no page refresh required. Realtime added in Issue 2 also pushes new reminders to all open tabs immediately.

---

### Issue 5 — Snooze: when to create a reminder

**Root cause confirmed:** `useTasks.snoozeTask` updates `tasks.snoozed_until` and snoozes any *existing* linked reminder, but never *creates* a fresh reminder for long snoozes — so a task snoozed for 8 hours with no reminder enabled is silently lost.

**Fix:** In `snoozeTask`:

- Compute `hoursToAdd`.
- If `hoursToAdd <= 4`: do nothing extra (current behavior).
- If `hoursToAdd > 4`: upsert a `reminders` row for this task with `reminder_datetime = snoozedUntil`, `title="Snoozed task: <task.title>"`, `assigned_to=task.assigned_to`, `is_snoozed=false`. Re-uses the same `entity_type='task' / entity_id=task.id` slot as the regular task reminder mirror so we never have duplicates.

---

### Issue 6 — `PhoneLink` missing `log` prop in 3 places

**Root cause confirmed:** Three usages omit the `log` prop entirely:

- `src/components/calendar/CalendarEventCard.tsx` line 118 — `event` already carries `relatedEntityType`, `relatedEntityId`, and (for tasks) we can also pass `lead_id`.
- `src/components/kit/KitTouchCard.tsx` line 176 — needs entity context propagated from `KitProfileTab` (`entityType`, `entityId`, `entityName` are already available there).
- `src/components/tasks/TaskKanbanView.tsx` line 256 — uses `task.lead.id`/`task.lead.name`, so we have `leadId` directly.

**Fix:** Pass `log={{ leadId, customerId, relatedEntityType, relatedEntityId }}` (whichever applies) in each location. Add 3 new props to `KitTouchCard` (`entityType`, `entityId`, `entityName`) and forward from the three `KitTouchCard` call sites in `KitProfileTab.tsx`. No new prop drilling for the other two — context is already local.

---

### Files Changed


| File                                                            | Change                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New SQL migration                                               | Trigger on `tasks` for follow-up sync (lead+customer). Add `tasks, leads, customers, activity_log, reminders` to `supabase_realtime` publication. Generalize `update_lead_followup_dates` for customers.                                                                                                                              |
| `src/components/leads/detail-tabs/LeadProfileTab.tsx`           | Realtime subscription on `activity_log` for this lead; refetch latest on INSERT.                                                                                                                                                                                                                                                      |
| `src/components/customers/detail-tabs/CustomerProfileTab.tsx`   | Replace hardcoded "Customer created" with live `activity_log` query + realtime subscription, mirroring lead pattern.                                                                                                                                                                                                                  |
| `src/hooks/useTasks.ts`                                         | Add `syncTaskReminder(task)` (upsert/delete `reminders` row from task fields). Call it after add/update/snooze/complete/delete. Add `syncCustomerFollowUpDates(customerId)` and call alongside `syncLeadFollowUpDates`. In `snoozeTask`, when `hours > 4`, upsert a snooze reminder via `syncTaskReminder` with the snooze fire time. |
| `src/components/leads/detail-tabs/LeadRemindersTab.tsx`         | Unified list: entity-direct + `reminders` rows for tasks linked to this lead. Each task-sourced item carries a "Task: …" sub-label.                                                                                                                                                                                                   |
| `src/components/customers/detail-tabs/CustomerRemindersTab.tsx` | Same unified list pattern (currently shows zero task reminders).                                                                                                                                                                                                                                                                      |
| `src/components/professionals/ProfessionalDetailView.tsx`       | Same unified list pattern in the Reminders section.                                                                                                                                                                                                                                                                                   |
| `src/components/calendar/CalendarEventCard.tsx`                 | Pass `log` prop to `PhoneLink` using `event.relatedEntityType` / `event.relatedEntityId`.                                                                                                                                                                                                                                             |
| `src/components/kit/KitTouchCard.tsx`                           | Add `entityType`, `entityId`, `entityName` props; pass into `PhoneLink`'s `log` prop.                                                                                                                                                                                                                                                 |
| `src/components/kit/KitProfileTab.tsx`                          | Forward `entityType`, `entityId`, `entityName` to all 3 `KitTouchCard` instances.                                                                                                                                                                                                                                                     |
| `src/components/tasks/TaskKanbanView.tsx`                       | Pass `log={{ leadId: task.lead.id, relatedEntityType: 'lead', relatedEntityId: task.lead.id }}` to `PhoneLink`.                                                                                                                                                                                                                       |


### Verification (after deploy)

I will then verify each item in the original checklist:

1. Open lead/customer → Profile tab "Latest Activity" reflects the most recent activity_log row, updates within seconds when a new task action is logged.
2. Leads/customers tables show task counts, overdue badges, and Last/Next Follow-up populated.
3. Reminders tab on Lead, Customer, Professional shows entity reminders + task reminders with "Task: …" label, sorted correctly.
4. Set a task reminder for 2 minutes from now → bell shows it within 60s without refresh; database confirms a `reminders` row exists with correct `reminder_datetime`.
5. Snooze a task by 2h → no `reminders` row added. Snooze by 8h → one `reminders` row appears with title "Snoozed task: …" and `reminder_datetime` = wake time.
6. Tap phone in Calendar event card / KIT touch card / Task Kanban card → activity_log row appears for the linked entity each time.

No `index.html` edits, no RLS edits, no removal of `gptengineer.js`, no schema breakage to `useTasks.ts` exports.  
  
I can see 4 gaps in the plan that need to be addressed before handing it to Lovable. Let me detail what's wrong and provide the corrected version.use the below as reference.

---

### Gaps Found in the Plan

**Gap 1 — Existing tasks with** `reminder=true` **will still have no bell after deploy.** The plan adds `syncTaskReminder` for future add/update/snooze/delete operations but says nothing about the hundreds of existing tasks that already have `reminder=true` and no corresponding `reminders` table row. After deploy, those tasks will still never ring. A one-time backfill migration is needed.

**Gap 2 — Issue 3 (Reminders tab) has an unnecessary middle path.** The plan describes three sources for the unified reminders list: direct entity reminders, tasks with `reminder=true`, AND reminders table rows for task-linked entity. Once Issue 4's `syncTaskReminder` is implemented, every task with `reminder=true` will already have a row in the `reminders` table. The "tasks with `reminder=true`" middle path becomes redundant and creates a risk of duplicate entries. Issue 3 should rely exclusively on the `reminders` table after Issue 4 is done.

**Gap 3 — Customer task linkage is different from Lead task linkage.** For leads, tasks are linked via `tasks.lead_id`. For customers, tasks are linked via `tasks.related_entity_type = 'customer'` AND `tasks.related_entity_id = <customer_id>`. The plan uses both fields in the trigger but doesn't explicitly state this for `CustomerRemindersTab`. The tab must look up tasks using `related_entity_type + related_entity_id`, not `lead_id`.

**Gap 4 — PR #62 conflict not acknowledged.** PR #62 already added code inside `snoozeTask` to snooze any existing linked reminder. Issue 5's fix builds on top of that. The plan must explicitly say: keep the PR #62 snooze-existing-reminder code, and add the long-snooze new-reminder creation on top of it. If Lovable doesn't know this, it may rewrite or remove the PR #62 logic.

---

## Updated Plan

---

### Issue 1 — Stale "Latest Activity" on Profile Cards

**Root cause confirmed:**

- `LeadProfileTab.tsx` fetches latest activity once on mount and only re-fetches on manual status changes. Other activity (task snoozes, updates, etc.) never triggers a refresh.
- `CustomerProfileTab.tsx` is hardcoded to show "Customer created" with `customer.created_at`. It never reads from `activity_log` at all.

**Fix:**

- Both tabs subscribe to Supabase Realtime on `activity_log` filtered by `lead_id` / `customer_id` and re-fetch the most recent row on INSERT.
- Customer tab: replace the hardcoded "Customer created" section with the same live `activity_log` query + display pattern used by `LeadProfileTab` (activity_type → friendly label, user_name, relative time).
- Add `activity_log` to the `supabase_realtime` publication via SQL migration.

---

### Issue 2 — Lead/Customer Task Counts, Overdue Badges & Follow-up Dates Not Updating

**Root cause confirmed:**

- DB has `update_lead_followup_dates()` function but **no trigger uses it** — `information_schema.triggers` is empty for `public`.
- `syncLeadFollowUpDates` exists in `useTasks.ts` and is called for add/update/snooze/delete — but only handles **leads**, never customers.
- No customer follow-up sync exists anywhere.
- `tasks` is not in the `supabase_realtime` publication, so task changes don't push badge/date updates to other open tabs.

**Fix:**

1. SQL migration:
  - Generalize `update_lead_followup_dates` into a trigger function that handles both leads (via `tasks.lead_id`) and customers (via `tasks.related_entity_type = 'customer'` AND `tasks.related_entity_id`).
  - Attach an `AFTER INSERT OR UPDATE OR DELETE` trigger on `tasks` that calls it. This guarantees follow-up dates stay in sync regardless of what code path mutates tasks — UI, automation engine, API.
  - Add `tasks`, `leads`, `customers`, `activity_log`, `reminders` to the `supabase_realtime` publication.
2. Frontend:
  - Add `syncCustomerFollowUpDates(customerId)` helper in `useTasks.ts` mirroring the existing lead one. Call it alongside `syncLeadFollowUpDates` wherever tasks linked to customers are mutated. The DB trigger is the source of truth — this provides immediate optimistic UI.
  - `useLeads.ts` / `useCustomers.ts`: subscribe to the `tasks` realtime channel and refetch on change so badges and dates refresh without page reload.

---

### Issue 3 — Reminders Tab Incomplete

**Root cause confirmed:**

- `LeadRemindersTab`, `CustomerRemindersTab`, and the Reminders section in `ProfessionalDetailView` only fetch reminders where `entity_type = <that entity type>` and `entity_id = <that entity id>`.
- Reminders set on tasks linked to these entities are stored as `entity_type = 'task', entity_id = <task_id>` and are completely invisible in the entity's Reminders tab.

**Fix:** **Important:** This fix depends on Issue 4 being implemented first. Once Issue 4's `syncTaskReminder` is in place, every task reminder exists as a row in the `reminders` table. Issue 3 therefore only needs to query the `reminders` table — no need to also read `tasks.reminder = true` directly. Using `tasks.reminder = true` as a source alongside the `reminders` table would create duplicates.

Refactor each of the three tab files to render a single unified sorted list from the `reminders` table only:

- **Direct reminders:** rows where `entity_type = <entityType>` AND `entity_id = <entityId>`
- **Task-linked reminders:** rows where `entity_type = 'task'` AND `entity_id` is the id of any task linked to this entity. For leads: tasks where `lead_id = <leadId>`. For customers: tasks where `related_entity_type = 'customer'` AND `related_entity_id = <customerId>`. For professionals: tasks where `related_entity_type = 'professional'` AND `related_entity_id = <professionalId>`.
- Merge both sets, deduplicate by reminder `id`.
- For task-sourced reminders, display a sub-label showing the task title (e.g., "Task: Follow-up: Ashima kumar") so the user knows the source.
- Sort: active (non-snoozed) reminders first, then by `reminder_datetime` ascending.

---

### Issue 4 — Bell Never Fires for Task Reminders

**Root cause confirmed:**

- `AddTaskDialog` and `EditTaskDialog` only save `reminder` (boolean) and `reminder_time` (minutes before due — stored as string: "15", "30", "60", "1440") directly on the `tasks` row.
- **No corresponding row is ever inserted into the** `reminders` **table.**
- The bell reads exclusively from the `reminders` table. Task reminders therefore never appear.

**Fix:**

Add a `syncTaskReminder(task)` helper in `useTasks.ts`. Call it after every successful `addTask`, `updateTask`, `completeTask`, `deleteTask`. Logic:

- If `task.reminder === true` AND task status is not Completed/Cancelled AND `task.due_date` exists:
  - Compute fire time: `(task.due_date + task.due_time or 09:00) minus task.reminder_time minutes`
  - If fire time is in the future: upsert one row into `reminders` — `entity_type = 'task'`, `entity_id = task.id`, `reminder_datetime = <computed fire time>`, `title = 'Reminder: <task.title>'`, `assigned_to = task.assigned_to`, `is_dismissed = false`, `is_snoozed = false`
  - If fire time is in the past: delete any existing reminders row for this task (it already fired or is overdue)
- If `task.reminder === false` OR task becomes Completed/Cancelled OR task is deleted: hard-delete any `reminders` rows where `entity_type = 'task'` AND `entity_id = task.id`
- If `due_date`, `due_time`, or `reminder_time` changes while reminder stays enabled: update `reminder_datetime` on the existing row and reset `is_snoozed = false` so it can fire fresh

**One-time backfill migration (critical — do not skip):** Add a SQL migration that inserts `reminders` rows for all existing tasks that currently have `reminder = true`, are not Completed/Cancelled, and whose computed fire time is in the future. Without this, all existing task reminders will continue to be silent after deploy. The migration should use the same computation: `(due_date + COALESCE(due_time, '09:00')::time) - (reminder_time::integer * interval '1 minute')`.

---

### Issue 5 — Snooze Task: When to Create a Reminder

**Root cause confirmed:** `snoozeTask` in `useTasks.ts` updates `tasks.snoozed_until` and — via PR #62 — also snoozes any existing linked reminder row. But no new reminder is created for long snoozes.

**Fix — builds on top of PR #62, do not remove PR #62's snooze-existing-reminder code:**

Keep the existing PR #62 logic (which marks the existing linked reminder as `is_snoozed = true, snooze_until = snoozedUntil`). Then add on top:

- If `hoursToAdd <= 4`: nothing extra needed.
- If `hoursToAdd > 4`: upsert a `reminders` row for this task with `reminder_datetime = snoozedUntil`, `title = 'Snoozed task: <task.title>'`, `assigned_to = task.assigned_to`, `is_snoozed = false`, `is_dismissed = false`, using the same `entity_type = 'task'` / `entity_id = task.id` slot. This replaces the existing reminder so there is only ever one active reminder per task — no duplicates.

---

### Issue 6 — PhoneLink Missing `log` Prop in 3 Places

**Root cause confirmed:** Three usages of `PhoneLink` omit the `log` prop entirely:

- `src/components/calendar/CalendarEventCard.tsx` — `event` already carries `relatedEntityType` and `relatedEntityId`
- `src/components/kit/KitTouchCard.tsx` — entity context is available in `KitProfileTab` but not forwarded into the card
- `src/components/tasks/TaskKanbanView.tsx` — `task.lead.id` and `task.lead.name` are already available locally

**Fix:**

- Check the exact shape of `PhoneLink`'s `log` prop interface first. Use only the fields it actually accepts — do not guess or invent prop names.
- `CalendarEventCard.tsx`: pass `log` using `event.relatedEntityType` and `event.relatedEntityId`.
- `KitTouchCard.tsx`: add `entityType`, `entityId`, `entityName` props to the component and pass them into `PhoneLink`'s `log` prop. Forward these three props from all `KitTouchCard` call sites in `KitProfileTab.tsx`.
- `TaskKanbanView.tsx`: pass `log` using `task.lead.id` and `task.lead.name` (entity type = 'lead').

---

### Files Changed


| File                                                            | Change                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New SQL migration (follow-up + realtime)                        | Trigger on `tasks` for follow-up sync (lead + customer). Add `tasks, leads, customers, activity_log, reminders` to `supabase_realtime` publication.                                                                                             |
| New SQL migration (backfill reminders)                          | One-time INSERT into `reminders` for all existing tasks with `reminder = true`, not completed/cancelled, fire time in future.                                                                                                                   |
| `src/components/leads/detail-tabs/LeadProfileTab.tsx`           | Realtime subscription on `activity_log` for this lead; refetch latest on INSERT.                                                                                                                                                                |
| `src/components/customers/detail-tabs/CustomerProfileTab.tsx`   | Replace hardcoded "Customer created" with live `activity_log` query + realtime.                                                                                                                                                                 |
| `src/hooks/useTasks.ts`                                         | Add `syncTaskReminder(task)` — upsert/delete `reminders` row from task fields. Call after add/update/complete/delete. Add `syncCustomerFollowUpDates`. In `snoozeTask`, add long-snooze reminder upsert on top of existing PR #62 snooze logic. |
| `src/components/leads/detail-tabs/LeadRemindersTab.tsx`         | Unified list from `reminders` table only: entity-direct + task-linked. Task label shown.                                                                                                                                                        |
| `src/components/customers/detail-tabs/CustomerRemindersTab.tsx` | Same unified list. Task lookup via `related_entity_type + related_entity_id`.                                                                                                                                                                   |
| `src/components/professionals/ProfessionalDetailView.tsx`       | Same unified list in Reminders section.                                                                                                                                                                                                         |
| `src/components/calendar/CalendarEventCard.tsx`                 | Pass `log` to `PhoneLink`.                                                                                                                                                                                                                      |
| `src/components/kit/KitTouchCard.tsx`                           | Add entity props; pass into `PhoneLink log`.                                                                                                                                                                                                    |
| `src/components/kit/KitProfileTab.tsx`                          | Forward entity props to `KitTouchCard`.                                                                                                                                                                                                         |
| `src/components/tasks/TaskKanbanView.tsx`                       | Pass `log` to `PhoneLink`.                                                                                                                                                                                                                      |


---

### Verification Checklist

1. Open any lead or customer → Profile tab "Latest Activity" shows the most recent `activity_log` row, updates within seconds when a new task action is logged
2. Leads table → leads with active tasks show correct task count and overdue badge
3. Customer profile → Next Follow-up and Last Follow-up populated and correct from linked tasks
4. Lead, Customer, Professional Reminders tab → shows both direct reminders and task reminders with "Task: …" label, sorted correctly, no duplicates
5. Set a task reminder for 2 minutes from now → confirm a `reminders` row exists in the DB immediately after saving → bell shows it within 60s without refresh
6. Existing tasks with `reminder = true` → confirm they now have corresponding `reminders` rows after the backfill migration runs
7. Snooze a task by 2h → no new `reminders` row created. Snooze by 8h → one `reminders` row with "Snoozed task: …" title appears
8. Tap phone in CalendarEventCard, KitTouchCard, TaskKanbanView → activity log row appears for linked entity each time

---

No RLS edits. No `index.html` edits. No removal of `gptengineer.js`. `assigned_to` and `created_by` always store `full_name`. Squash-merge only.