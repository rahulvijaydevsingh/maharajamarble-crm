## Maharaja Marble CRM — 6-task cleanup plan

Brand and `.gitignore` untouched. All changes type-safe.

### Task 1 — Pill bar parity + type cleanup

**1a. Customer filter pills match Leads exactly**

- `src/components/customers/EnhancedCustomerTable.tsx` (lines ~929-980): replace the rounded/badge pill block with the Leads markup (`variant={isActive ? "default" : "outline"}`, `size="sm"`, `className="gap-1"`, leading count `<span class="font-semibold">{count}</span>` then name; same Clear button).
- `onClick` already calls `applyFilter(filter)` — leave as-is, remove the inline `cn(...)` block so it mirrors Leads 1:1.

**1b. `src/hooks/useLeads.ts**`

- Drop `as any` from `addLead` destructuring.
- Rewrite `updateLead`'s `changedFields` to the object-aware diff from the brief (uses `JSON.stringify` for object values; falls back to `String()` for scalars). Stops `[object Object]` rows in activity log.

**1c. `src/hooks/useReminders.ts**`

- Remove unnecessary `as any` cast in `addReminder` (current code already destructures `{ created_by: _cb, ...reminderWithoutCb }`; tighten the cast that remains, if any).

**1d. `src/lib/filterRuleEngine.ts` + filter dialogs**

- Canonical operators only in the `FilterOperator` union: `greater_than_or_equal`, `less_than_or_equal` (remove `greater_or_equal` / `less_or_equal`).
- Keep `switch` fallthroughs accepting the legacy strings so existing saved filters keep working.
- In `LeadSavedFilterDialog`, `CustomerSavedFilterDialog`, `ProfessionalSavedFilterDialog`, normalize legacy operator strings on load (`greater_or_equal → greater_than_or_equal`, same for `less_*`).

### Task 2 — Snooze reminder leak (resurrection)

Root cause in `src/hooks/useTasks.ts` `snoozeTask` (lines ~820-907): when the user dismissed the bell, two pieces of state went stale and never came back on snooze — (i) the `tasks.reminder` column flipped to `false`, and (ii) any pre-existing `reminders` row is `is_dismissed=true`, so the snooze `UPDATE … WHERE is_dismissed=false` matches 0 rows. `syncTaskReminder` already does delete+insert with a fresh active row, but because `tasks.reminder` stays `false`, the EditTask dialog and any next re-sync show the toggle OFF, and the next non-snooze update wipes the reminder again.

Fix (single place, `snoozeTask`):

1. After the `snooze_task` RPC succeeds, also `UPDATE tasks SET reminder = true, reminder_time = COALESCE(reminder_time, '0') WHERE id = :id` — gated on "auto-reminder ON". Since there is no global auto-reminder setting today, treat the per-task `reminder` field as the auto-reminder switch: if it was ever on at task creation (default true) we re-arm; if the user explicitly created the task with `reminder:false` we leave it off. Practically: re-arm unless `task.reminder === false` AND `task.reminder_time === null` (i.e. user opted out from the start). Document this as the rule.
2. Update local `tasks` state with `reminder: true` so the UI toggle flips back immediately.
3. Drop the `is_dismissed=false` filter on the pre-snooze `reminders` select — also catch dismissed rows and clear them (`is_dismissed:false, is_snoozed:false`). `syncTaskReminder` then deletes+inserts a clean active row regardless.
4. Existing `syncTaskReminder(..., { fireAt })` call already inserts `is_dismissed:false, is_snoozed:false` — keep.

Result: snooze always resurrects the alarm track, the task toggle reflects it, and a previously-dismissed reminder cannot leave the lead silent.

### Task 3 — Abandoned tasks: null-safety + admin Recycle Bin

**Null guards** in task list/card/detail components (`TaskList.tsx`, `TaskTable.tsx`, `EnhancedTaskTable.tsx`, `TaskKanbanView.tsx`, `TaskDetailView.tsx`):

- Every `task.lead.<x>` / `task.customer.<x>` / `task.professional.<x>` access becomes `task.lead?.<x> ?? "Archived Lead"` (or "—" for contact fields).
- Same for related-entity name lookups when the entity was soft-deleted.

**Recycle Bin tab** on `src/pages/Tasks.tsx`:

- Add a "Recycle Bin" tab visible only when `hasRole('super_admin' | 'admin' | 'manager')`.
- Query: tasks where (a) `status = 'Cancelled'`, OR (b) `lead_id` points to a lead with `status = 'deleted'`, OR (c) `related_entity_type='lead'` and the referenced lead is deleted. Use a single `useTasks` variant or filter at the query layer with `leads!inner(status)`.
- Default (Active) tab excludes these — add the inverse filter to the existing query so daily queues stay clean.
- No auto-deletion; rows remain for audit.

### Task 4 — Dashboard Reminders widget overhaul

`src/components/dashboard/RemindersWidget.tsx`:

1. **Fix "View all reminders" link** — current `<Button variant="link">` has no handler. Wrap in `onClick={() => navigate('/reminders')}` (or the existing reminders workspace route — confirm in `App.tsx` routes; if absent, route to `/tasks?view=reminders`).
2. **Admin staff filter dropdown** in header — visible only when `hasRole('admin' | 'super_admin')`. Source from `useActiveStaffOptions()`. Default value `"all"`. Passes selected `full_name` into `useReminders(undefined, undefined, selectedAssignee !== 'all' ? selectedAssignee : undefined)`.
3. **Non-admin isolation** — when not admin, force `assignedTo = profile?.full_name`. `useReminders` already supports the `assignedTo` arg and the realtime listener already filters on it.

### Task 5 — Staff dropdown roles in one query

`src/hooks/useActiveStaff.ts`:

- Replace N+1 `rpc('get_user_role')` loop with a single Supabase select that joins `user_roles`:
  ```ts
  supabase
    .from('profiles')
    .select('id, full_name, email, phone, user_roles(role)')
    .eq('is_active', true)
    .order('full_name');
  ```
- Map `profile.user_roles?.[0]?.role` into the returned `role` field. RLS on `user_roles` already allows `authenticated` to read; the join runs in one round-trip and works for every clearance tier.
- `useActiveStaffOptions` now also emits a `label` string `"<Name> (<RoleLabel>)"` so every "Assigned To" dropdown across the app renders identically (consumers can keep using `name` for backward compat, switch to `label` where the parenthetical role is desired).
- If `user_roles` embed fails RLS for some tier, fall back to `has_role` per id — but expected to work given existing `user_roles` policy.

### Task 6 — Dynamic Lead Lost Reasons

**Data**: reasons live in `lead_lost_reasons` table (already present per file list) — confirm shape; if it's already CRUD-ready, reuse. Otherwise, store under the existing `control_panel_options` / `control_panel_option_values` pattern with `entity='leads'`, `field='lost_reason'` for consistency with other dynamic dropdowns.

**Dialog**: `src/components/leads/MarkAsLostDialog.tsx` — replace hardcoded array with `getFieldOptions('leads','lost_reason')` from the existing control-panel hook used elsewhere (e.g. `useControlPanelSettings`).

**Admin UI**: in `src/components/settings/ControlPanel.tsx`, add a "Lead Lost Reasons" section mirroring the existing CRUD rows (add / edit / delete). Restrict the section with `hasRole('super_admin' | 'admin')`.

**Persistence**: lead record continues to store the reason as a string in its existing `lost_reason` column; activity log entry's description already concatenates the value — no change.

### Verification

- `tsgo` clean.
- Snooze flow: dismiss a task reminder → snooze 4h → confirm `tasks.reminder=true`, fresh active `reminders` row, bell fires at +4h.
- Soft-delete a lead with an open task → open Tasks page as field agent → no crash, sees "Archived Lead"; admin sees the task in Recycle Bin tab.
- Field agent opens an Assigned To dropdown → sees role suffixes identical to admin.
- Admin adds a Lost Reason in Control Panel → appears in MarkAsLostDialog.

### Out of scope

`.gitignore` not touched. No backend re-pointing. No edge-function changes.  
  
  


---

## Suggested Additions / Corrections

### Pre-flight: Jules PR Conflict Risk — Explicit Warning Needed

The plan doesn't address the conflict between this Lovable session and Jules PRs #102/#104 which touched `useLeads.ts`, `useReminders.ts`, `filterRuleEngine.ts`, and both filter dialogs. If those PRs were merged to main before this Lovable session, Lovable will overwrite the merged work. If they're unmerged, this Lovable session creates a conflict on the branch. **Add to the preamble:** confirm PR #102 merge status before Lovable starts(PR#102 was merged). If merged, ensure Lovable has pulled the latest `main` as its base. If not merged, close/abandon those Jules PRs before this Lovable session — don't run both tracks simultaneously.

---

### Task 1d — ProfessionalSavedFilterDialog: Don't Re-add What's Already There

The plan says to normalize all three dialogs including `ProfessionalSavedFilterDialog`. But that file **already has** the normalization block from a previous session. Adding it again creates a duplicate block. Change the instruction to: **"Verify** `ProfessionalSavedFilterDialog` already contains the normalization block for `greater_or_equal` → `greater_than_or_equal`. If present, do not modify it. If absent, add it. Do not add a second instance either way."

---

### Task 2 — Simplify the Re-arm Condition

The plan's re-arm logic — *"re-arm unless* `task.reminder === false` *AND* `task.reminder_time === null`*"* — introduces an edge case where a user who initially created a task with reminders disabled still gets re-armed if they set a `reminder_time`. The intent is simpler: **if you're snoozing, you want an alarm at the new time, full stop.** Replace that nuanced condition with an unconditional rule:

> Always set `tasks.reminder = true` and `tasks.reminder_time = COALESCE(existing_reminder_time, '0')` after a successful snooze RPC. No exceptions. Snoozing IS consent to be reminded.

Also: the pre-snooze `reminders` select that filters `is_dismissed=false` should be changed to fetch **all** rows for that task (regardless of dismissed state) so dismissed reminders are also cleaned up before `syncTaskReminder` inserts the fresh one. The plan mentions this but make it explicit in the code change.

---

### Task 3 — Fix `leads!inner` Query — Will Exclude Non-Lead Tasks

The Recycle Bin query using `leads!inner(status)` performs an INNER JOIN. This will **silently exclude** tasks linked to customers or professionals (where `lead_id = null`), so the Recycle Bin would miss all cancelled customer tasks. Change to:

```ts
.select('*, lead:leads(status)')  // outer join — lead can be null

```

Then filter Recycle Bin tasks client-side:

```ts
task.lead?.status === 'deleted' 
  || (task.status === 'Cancelled' && daysSince(task.updated_at) > 30)

```

---

### Task 3 — `hasRole` Confirmed, One Nuance

`hasRole` is confirmed real in `AuthContext.tsx` and uses a hierarchy — `hasRole('manager')` returns `true` for super_admin, admin, AND manager. This is exactly right for the Recycle Bin. One addition: use `const { hasRole, isAdmin } = useAuth()` — `isAdmin()` is also available as a pre-built helper (returns `true` for super_admin or admin). Use `isAdmin()` for Task 4's admin dropdown condition instead of the manual role string check.

---

### Task 4 — Route Verification Is Mandatory, Not Optional

The plan says "confirm in App.tsx routes; if absent, route to `/tasks?view=reminders`". This needs to be a hard instruction, not a soft suggestion: **"Before writing the** `navigate()` **call, read** `src/App.tsx` **to find the exact route string for the Reminders page. Do not hardcode** `/reminders` **without verification. If no dedicated Reminders route exists, navigate to the route that renders the task management view."**

---

### Task 5 — `user_roles` Join: Specify FK Explicitly

`profiles.id` and `user_roles.user_id` both reference `auth.users.id` — there is no direct FK between the two tables, so Supabase's auto-relationship detection may not work. Add explicit FK hint:

```ts
supabase
  .from('profiles')
  .select('id, full_name, email, phone, user_roles!user_roles_user_id_fkey(role)')
  .eq('is_active', true)
  .order('full_name')

```

If Supabase rejects the FK hint (hint not found), fall back to: fetch profiles, then do a single `user_roles` query for all user IDs in one `in()` call — not per-user N+1.

Also: confirm `label` field in `useActiveStaffOptions` is **additive** — the existing `name` field stays unchanged so all current consumers continue working. Components that want the formatted designation can use `label`; components that need just the name (like assigned_to storage — INVARIANT-04) keep using `name`.

---

### Task 6 — Use `control_panel_option_values`, Not Separate Table

`lead_lost_reasons` table exists in `types.ts` (confirmed), but it's an extra table with separate CRUD logic to build. The `control_panel_option_values` pattern is already implemented, already has admin CRUD UI, and already powers Lead Source and Construction Stage — adding Lost Reasons there means zero new infrastructure. **Override the plan:** use `entity='leads'`, `field='lost_reason'` in `control_panel_option_values`. Seed with snake_case values matching the existing pattern: `price_too_high`, `competitor_chosen`, `project_cancelled`, `no_response`, `timeline_mismatch`, `other`.

Also: "activity log entry's description already concatenates the value" is unverified. Make it explicit: **"In the** `handleMarkAsLost` **flow in** `LeadDetailView.tsx`**, find the** `logActivity` **or** `updateLead` **call that fires when the lead status is set to 'lost'. Append the selected reason to the description string:** `'Lead marked as lost. Reason: ' + reasonLabel`**. If no such concatenation currently exists, add it."**