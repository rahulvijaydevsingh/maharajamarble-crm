

## Prompt 3: Task Completion Form Redesign — Close Task + Follow-up Chain

### What Changes

The current `TaskCompletionDialog` always marks the task as "Completed" on submit. The redesign introduces three behavioral changes:

**A. Close Task Checkbox** — A new checkbox (default: unchecked) at the bottom of the form:
- **Unchecked**: Save outcome/notes but keep task status as-is (open). Sets `completion_outcome` and `completion_notes` but does NOT set `status = "Completed"`. Logs `outcome_recorded` to `task_activity_log`.
- **Checked**: Sets `status = "Completed"`, `closed_at = now()`, `closed_by = current user UUID`. Logs `closed` to `task_activity_log`.

**B. Follow-up Task Pre-fill + Reminder Fields** — When "Create Follow-up" is selected:
- New task is pre-filled with parent's type, assigned_to, lead_id, related_entity, and the parent's notes in the description.
- `parent_task_id` is set to the current task's ID (already working).
- Add two new optional fields to the follow-up section: **Auto Reminder** (number input for `reminder_offset_hours`) and **Custom Reminder** (datetime picker for `custom_reminder_at`).
- Log `follow_up_created` to parent task's `task_activity_log` with the new task's ID.

**C. Activity Log Writes** — On every submission, insert into `task_activity_log`:
- `event_type`: `outcome_recorded` | `closed` | `follow_up_created`
- `user_id`: current auth user UUID
- `user_name`: current user email
- `metadata`: contains outcome, notes, old/new values as appropriate

Also write to the lead's `activity_log` (if `lead_id` is set) and `staff_activity_log`.

### Current vs New Behavior

| Current | New |
|---------|-----|
| Submit always marks task "Completed" | Only marks completed if "Close Task" is checked |
| `nextAction` is mandatory | `nextAction` becomes optional (only required if Close Task is unchecked, to decide what happens next) |
| No `task_activity_log` inserts from this dialog | Inserts `outcome_recorded` / `closed` / `follow_up_created` |
| No reminder fields on follow-up | `reminder_offset_hours` + `custom_reminder_at` fields |
| Button says "Complete Task" | Button says "Save Outcome" (unchecked) or "Close Task" (checked) |

### Validation Changes

- Outcome: still required
- Notes: still required (50 char min)
- Next Action: required only when Close Task is **unchecked** (task stays open, must have a next step). When Close Task is checked, next action is optional.
- Date/time: required only when next action is follow_up or reschedule

### Implementation

**File: `src/components/tasks/TaskCompletionDialog.tsx`**
- Add `closeTask` boolean state (default false)
- Add `reminderOffsetHours` and `customReminderAt` state for follow-up
- Update `validate()` logic per above
- Update `handleSubmit()`:
  - If `closeTask` unchecked: update task with outcome/notes only (no status change), insert `outcome_recorded` to `task_activity_log`
  - If `closeTask` checked: update task with status="Completed" + `closed_at` + `closed_by`, insert `closed` to `task_activity_log`
  - If follow-up created: pass `reminder_offset_hours`/`custom_reminder_at` to `addTask`, insert `follow_up_created` to `task_activity_log`
  - Log to lead activity_log if lead_id exists
  - Log to staff_activity_log
- Add checkbox UI at bottom before footer
- Add reminder fields in the follow-up section
- Change button label dynamically

**File: `src/hooks/useTasks.ts`**
- Update `TaskInsert` interface to include `closed_at`, `closed_by`, `reminder_offset_hours`, `custom_reminder_at` as optional fields (they exist in DB now)
- Update `Task` interface similarly

No other files need changes — all 7 places that render `TaskCompletionDialog` pass `updateTask` and `addTask`, which will handle the new fields transparently.

### Technical Notes
- `task_activity_log` inserts use `supabase.from("task_activity_log").insert(...)` directly in the dialog since `useTaskActivityLog` is read-only
- `useAuth()` is used inside the dialog to get `user.id` and `user.email` for `closed_by` and log entries
- The `logActivity` hook (from `useLogActivity`) is used for lead timeline propagation
- `logToStaffActivity` is used for staff performance log

