

## Plan: KIT Touch → Task Sync + Workflow-Based Lead Auto-Advance

Two parts: (1) Implement KIT touch completion toggle and KIT→lead sync, (2) Replace the buggy "Auto In Progress" automation rule with proper workflow rules that advance leads from `new` → `in-progress` for both KIT and regular task activity.

---

### Part 1 — KIT Touch Completion + Linked Task Sync

**`src/components/kit/KitTouchCompleteDialog.tsx`**
- Add prop `hasLinkedTask?: boolean`
- Change `onComplete` signature to `(outcome, notes, alsoCompleteTask: boolean) => Promise<void>`
- When `hasLinkedTask === true`, render a Checkbox (default checked) below the outcome RadioGroup and above the Notes textarea:
  - Label: "Also mark the linked task as Completed"
  - Sub-label (muted, smaller): "The task linked to this touch will be closed automatically"
- Track `alsoCompleteTask` state (default `true`); pass it through `handleSubmit`
- When `hasLinkedTask` is false, never show the toggle and pass `false`

**`src/components/kit/KitProfileTab.tsx`**
- `handleCompleteTouch` signature → `(outcome, notes?, alsoCompleteTask?)`
- Pass `alsoCompleteTask ?? true` into `completeTouch({...})`
- On `<KitTouchCompleteDialog>` add `hasLinkedTask={!!completeDialogTouch?.linked_task_id}`

**`src/pages/CalendarPage.tsx`**
- `handleKitTouchComplete` signature → `(outcome, notes?, alsoCompleteTask?)`
- Pass `alsoCompleteTask` into `completeTouch`
- Pass `hasLinkedTask={!!selectedKitEvent?.linked_task_id}` (or fetch via a quick lookup if not on the event) to the dialog. If `linked_task_id` isn't on `CalendarEvent`, default the prop based on `event.source === 'kit_touch'` and let the hook no-op when the touch has no linked task.

**`src/hooks/useKitTouches.ts` — `completeMutation`**
- Extend input type with `alsoCompleteTask?: boolean`
- Before the existing update, fetch `linked_task_id, subscription_id` from `kit_touches`
- After the existing kit_touches update succeeds, in a `try/catch`:
  1. If `alsoCompleteTask && touchData.linked_task_id`: update that task to `status: 'Completed', completed_at: now()`
  2. Lead auto-advance is removed from this hook — handled by the workflow automation (Part 2) instead. Rationale: avoids duplicating logic and keeps the rule centrally manageable. (If you prefer client-side fallback as a safety net, say so and I'll keep the try/catch lead update.)
- `onSuccess`: invalidate `['tasks']` and `['leads']`

**`src/hooks/useKitTouches.ts` — `snoozeMutation` and `rescheduleMutation`**
- Already sync to linked task. Add `queryClient.invalidateQueries({ queryKey: ['leads'] })` in their `onSuccess` (the lead status change will be done by automation when the linked task's `snoozed_until` / `due_date` updates).

---

### Part 2 — Workflow Automation: Lead `new` → `in-progress`

**Database migration — fix and add automation rules.** The existing "Auto In Progress" rule is broken (targets `trigger_record` on tasks table = updates the task itself, uses underscore status, fires only on task creation). Replace it with two correct rules.

**Rule A — "Lead Auto In-Progress on Task Activity" (entity: `tasks`)**
- Trigger: `field_change` with conditions:
  - `lead_id is_not_empty` AND
  - any of: `status changes_to Completed` OR `snoozed_until any_field_updated` OR `due_date any_field_updated`
  - `condition_logic: 'or'` for the activity triggers, combined with the `lead_id` filter
  
  Implementation note: the engine uses a single `condition_logic`. We'll create the rule with `condition_logic: 'or'` and include `lead_id is_not_empty` as a guard inside the `update_field` action's condition, OR split into 3 separate rules (one per trigger). **Simpler: 3 small rules** — `Lead Auto In-Progress on Task Completed`, `… on Task Snoozed`, `… on Task Rescheduled`, each with `lead_id is_not_empty AND <event>` and `execution_limit: 'unlimited'` (the action is idempotent — it only writes if status === 'new').
- Action: `update_field` targeting `related_entity` of type `leads` via `trigger_record.lead_id`, field `status`, value `in-progress` (with hyphen, matching DB).

  Need to verify the engine supports a target like `lead_id` lookup. Looking at `executeAction` in `run-automations`: the `update_field` action with `related_entity_type: 'leads'` updates the related entity. We'll set `target: 'related_entity'`, `related_entity_type: 'leads'`, `related_entity_field: 'lead_id'`. If the engine doesn't support that exact shape, we'll add an `exclude_conditions` to skip when the lead is already non-`new` — and use a small `pg` SQL helper. Confirmed approach: use the same shape as the existing buggy rule but switch `target: 'related_record'` and add `related_entity_field: 'lead_id'`. We'll inspect `executeAction` logic and adjust the action JSON to match what the function actually consumes.

**Rule B — "Lead Auto In-Progress on KIT Touch Activity" (entity: `kit_touches`)** *(if `kit_touches` is registered in `ENTITY_TABLE_MAP` of `run-automations`)*
- 3 rules mirroring the task rules: trigger on `status changes_to completed`, `snoozed_until any_field_updated`, `scheduled_date any_field_updated`
- Action: `update_field` on the linked lead via `kit_subscriptions.entity_id` lookup

  **Caveat:** `run-automations` currently only maps a fixed set of tables. If `kit_touches` isn't in the map, the trigger won't fire. I'll add it to `ENTITY_TABLE_MAP` in the edge function and redeploy. Lead resolution from a kit_touch requires a 2-hop join (`kit_touches → kit_subscriptions → leads`) which the current `update_field` action doesn't support. Two options:
  - **(a)** Extend `executeAction` with a new helper to resolve `kit_subscription.entity_id` when entity_type=`lead`.
  - **(b)** Skip Rule B and rely on the KIT→linked_task sync in Part 1 — when a touch is completed/snoozed/rescheduled with a linked task, the task's fields update too, which fires Rule A on the task and advances the lead. This is cleaner and reuses Rule A.

  **Going with (b)** — no need for Rule B or edge-function changes. Every KIT touch with a linked task already syncs to the task; Rule A on tasks then advances the lead.

**Migration steps:**
1. Delete (or deactivate) the existing buggy rule `cb47f2d9-ef5d-4eeb-9db7-9ce3f361c0ce` ("Auto In Progress")
2. Insert 3 new active rules on `entity_type = 'tasks'`:
   - "Lead → In-Progress on Task Completed"
   - "Lead → In-Progress on Task Snoozed"
   - "Lead → In-Progress on Task Rescheduled"
3. Each rule uses `update_field` on related lead with value `in-progress`, `execution_limit: 'unlimited'`

**Verify after deploy:** Open a lead in `new`, complete/snooze/reschedule a linked task (or KIT touch with linked task) → lead flips to `in-progress` automatically.

---

### Files Changed

| File | Change |
|------|--------|
| `src/components/kit/KitTouchCompleteDialog.tsx` | Add `hasLinkedTask` prop + checkbox + 3-arg `onComplete` |
| `src/components/kit/KitProfileTab.tsx` | Forward `alsoCompleteTask`; pass `hasLinkedTask` to dialog |
| `src/pages/CalendarPage.tsx` | Same forwarding for calendar KIT completion |
| `src/hooks/useKitTouches.ts` | Complete linked task on opt-in; invalidate `['tasks']`/`['leads']` in 3 mutations |
| Supabase migration | Delete buggy rule, insert 3 corrective workflow rules |

No changes to `useTasks.ts`, no schema changes, no edge function code changes.

