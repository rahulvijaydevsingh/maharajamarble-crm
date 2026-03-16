

## Prompt 4 & 5: Reschedule Flow Fix + Timeline Panel & Chain Navigation

### Current State

- **Prompt 4 (Reschedule)**: The "Reschedule" option in TaskCompletionDialog currently creates a NEW task (identical to follow-up). The spec says reschedule should update the SAME task's due date, increment `reschedule_count`, store `reschedule_reason`, and log to `task_activity_log` with old/new dates. There is NO standalone reschedule dialog -- rescheduling is done through the Edit dialog (due date change) or the completion dialog. The Edit dialog does NOT log to `task_activity_log` when the due date changes, and has no mandatory reason field.

- **Prompt 5 (Timeline + Chain)**: The `TaskActivityTimeline` renders entries but shows raw metadata in a `<details>` collapsible. No parent task banner, no follow-up links, no special rendering for `rescheduled`, `closed`, `follow_up_created` event types. No chain navigation.

### Plan

#### Task 1: Redesign Reschedule in TaskCompletionDialog

**File: `src/components/tasks/TaskCompletionDialog.tsx`**

Change the `reschedule` next action to update the SAME task instead of creating a new one:

- When `nextAction === "reschedule"`:
  - Update current task's `due_date`, `due_time`, `reschedule_count` (+1), `reschedule_reason` (from a new mandatory text field), `reminder_offset_hours`, `custom_reminder_at`
  - Do NOT create a new task
  - Log `rescheduled` to `task_activity_log` with `old_value` (previous due date), `new_value` (new due date), `reason`
  - Log to lead's `activity_log` if `lead_id` exists: "Task rescheduled: [title] — [reason]"
  - Log to `staff_activity_log`: "task_rescheduled"

- Add a "Reschedule Reason" mandatory text field that appears when `nextAction === "reschedule"`
- Keep `follow_up` behavior unchanged (creates new task)
- Update validation: reschedule reason required when rescheduling

#### Task 2: Add Reschedule Logging to EditTaskDialog

**File: `src/components/tasks/EditTaskDialog.tsx`**

When the due date changes in the edit dialog:
- Detect due date change (compare old vs new)
- If changed, show a mandatory "Reschedule Reason" dialog/prompt before saving
- On save with date change: increment `reschedule_count`, set `reschedule_reason`, log `rescheduled` to `task_activity_log`
- Log to lead timeline and staff activity log

Implementation: Add a confirmation step -- when `handleSave` detects a due date change, show an inline reason input that blocks save until filled. Or simpler: add an optional "Reschedule Reason" field that becomes visible and mandatory when due date differs from original.

#### Task 3: Enhanced Timeline Rendering

**File: `src/components/tasks/TaskActivityTimeline.tsx`**

Replace raw metadata display with formatted rendering per event type:
- `created`: "Task created" with icon
- `rescheduled`: "Rescheduled" showing old date → new date + reason (not in collapsible)
- `outcome_recorded`: "Outcome noted" showing outcome text
- `follow_up_created`: "Follow-up task created" with clickable link to new task
- `closed`: "Task closed by [staff name]"
- Other types: current fallback rendering

Add `onOpenTask?: (taskId: string) => void` prop for follow-up navigation.

#### Task 4: Parent Task Banner + Follow-up Links

**File: `src/components/tasks/TaskDetailView.tsx`**

- **Parent banner**: If `task.parent_task_id` exists, query parent task title and show banner: "This is a follow-up to: [parent task title]" with clickable link that opens parent in TaskDetailView
- **Follow-up section**: Query tasks where `parent_task_id = task.id`, show at bottom: "Follow-up tasks: [list]" with clickable links
- Show `reschedule_count` and `reschedule_reason` in Task Details card if set
- Show `reminder_offset_hours` and `custom_reminder_at` in the details card

#### Task 5: Lead Timeline Propagation Verification

Verify all task events propagate to lead timeline. From code review:
- `outcome_recorded` / `closed`: Already logged in TaskCompletionDialog ✓
- `follow_up_created`: Already logged ✓
- `rescheduled`: Will be added in Task 1 and Task 2
- `created`: Check if AddTaskDialog logs -- need to verify and add if missing

#### Task 6: Reminder Notification Section C (Prompt 4)

**DB Migration**: Add `reminded_at` column to tasks table to track reminder firing.

**File: `supabase/functions/run-automations/index.ts`**: This is a larger change to the edge function. Given complexity, I recommend handling reminder checks as a separate enhancement -- the column infrastructure is there, but wiring it into the automation engine requires careful work with the existing trigger evaluation logic.

### Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `src/components/tasks/TaskCompletionDialog.tsx` | Reschedule updates same task + reason field + activity logs |
| 2 | `src/components/tasks/EditTaskDialog.tsx` | Detect due date change, add reason field, log reschedule |
| 3 | `src/components/tasks/TaskActivityTimeline.tsx` | Rich rendering per event type + task navigation callback |
| 4 | `src/components/tasks/TaskDetailView.tsx` | Parent banner, follow-up links, reschedule/reminder details |
| 5 | DB Migration | Add `reminded_at` TIMESTAMPTZ to tasks |

### Technical Notes
- Reschedule in completion dialog changes from "create new task" to "update same task" -- this is a behavioral change
- The `reschedule_reason` field in completion dialog uses a `Textarea` that appears only when `nextAction === "reschedule"`
- Parent/child task queries use the existing `parent_task_id` column
- Follow-up tasks list in TaskDetailView uses a simple Supabase query filtered by `parent_task_id`

