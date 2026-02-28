

## Plan: Replace Bulk Task Form with Full AddTaskDialog (minus Related Entity)

### Overview
Replace the simplified inline bulk task creation form in `EnhancedLeadTable.tsx` with a new mode of the existing `AddTaskDialog` component. This avoids duplicating form UI and gives bulk task creation all the same features: templates, star/priority, reminders, recurrence, and subtasks.

### Approach: Add a "bulk" mode to AddTaskDialog

Rather than maintaining two separate forms, we will add a `bulkMode` prop to `AddTaskDialog`. When in bulk mode:
- The "Related Entity" section is hidden (since leads are auto-linked)
- The "Save & Add Another" button is hidden
- The dialog title/description changes to reflect bulk creation (e.g., "Create Tasks for 15 Leads")
- On submit, instead of creating a single task, it returns the task data + subtasks to the parent for batched creation

### Changes

**File: `src/components/tasks/AddTaskDialog.tsx`**

1. Add new optional props to `AddTaskDialogProps`:
   - `bulkMode?: boolean` -- enables bulk mode
   - `bulkLeadCount?: number` -- number of selected leads (for display)
   - `onBulkTaskSubmit?: (taskData: any, subtasks: Subtask[]) => void` -- callback that returns the form data instead of creating a task directly

2. When `bulkMode` is true:
   - Hide the `RelatedEntitySection` component
   - Change dialog title to "Create Tasks for {bulkLeadCount} Leads"
   - Change dialog description to "A task will be created and linked to each selected lead"
   - Hide the "Save & Add Another" button
   - On submit: call `onBulkTaskSubmit(taskData, subtasks)` instead of calling `addTask()` directly, then close the dialog

**File: `src/components/leads/EnhancedLeadTable.tsx`**

1. Remove the `bulkTaskFormData` state and its inline form UI (the entire `{bulkActionType === "create_task" && (...)}` block inside the bulk action dialog)

2. Add a new state: `bulkTaskDialogOpen` (boolean)

3. Change the "Create Task" dropdown menu item to open this new dialog instead of the bulk action dialog:
   - `setBulkTaskDialogOpen(true)` instead of `setBulkActionType("create_task"); setBulkActionDialogOpen(true);`

4. Add `<AddTaskDialog>` instance with `bulkMode={true}` and `bulkLeadCount={selectedLeads.length}`

5. Implement `onBulkTaskSubmit` handler:
   - Receives `taskData` and `subtasks` from the dialog
   - Uses existing batched processing pattern (batch size 10, `Promise.allSettled`, progress indicator)
   - For each selected lead: calls `addTask({...taskData, lead_id: leadId, related_entity_type: "lead", related_entity_id: leadId})`
   - After each task is created, if subtasks exist, inserts them into `task_subtasks`
   - Shows success/error toast with count
   - Clears selection on completion

6. Remove the `create_task` case from the existing bulk action dialog and `handleBulkAction` function (since it now uses its own dialog)

### Technical Details

- The `AddTaskDialog` in bulk mode validates the form the same way (title required, min 5 chars, etc.)
- Subtasks are created per-task: each lead's task gets its own copy of the subtasks
- Recurrence settings, reminders, starred status all carry over to each created task
- The assignee field defaults to staff but can be overridden; if left as-is, each task uses that assignee (not the lead's `assigned_to` like before -- the user explicitly picks)
- Templates work the same way in bulk mode
- Progress indicator reuses the existing `bulkProgress` state

