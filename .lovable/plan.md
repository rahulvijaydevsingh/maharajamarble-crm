

## Plan: Add Bulk Task Creation for Selected Leads

### Overview
Add a "Create Task" option to the Bulk Actions dropdown in the Leads table. When selected, it opens a dialog where the user fills in task details (type, title, priority, assignee, due date/time, description). On confirmation, a task is created for each selected lead, linked via `lead_id` and `related_entity_id`, using the existing batched `Promise.allSettled` pattern.

### Changes

**File: `src/components/leads/EnhancedLeadTable.tsx`**

1. **Add new state for bulk task form data:**
   - `bulkTaskFormData` with fields: `title`, `type`, `priority`, `assignedTo`, `dueDate`, `dueTime`, `description`

2. **Add "Create Task" menu item** in the Bulk Actions dropdown (under the `canEdit("leads")` section), with a `ClipboardList` icon. Clicking sets `bulkActionType` to `"create_task"` and opens the dialog.

3. **Extend the `handleBulkAction` function** to handle `bulkActionType === "create_task"`:
   - For each selected lead, call `addTask()` with the form data plus `lead_id: leadId`, `related_entity_type: "lead"`, `related_entity_id: leadId`
   - Use the same batch-of-10 pattern with progress indicator

4. **Extend the Bulk Action Dialog UI** to render a task creation form when `bulkActionType === "create_task"`:
   - Task Type select (from control panel options or fallback constants)
   - Title input (pre-filled based on type, e.g., "Follow-up Call - {type}")
   - Priority select (High/Medium/Low)
   - Assigned To select (from `staffMembers`)
   - Due Date picker + Due Time input
   - Description textarea (optional)
   - Update dialog title/description to reflect "Create Tasks for X leads"
   - Update submit button disabled logic and label

5. **Import `useTasks`** hook (for `addTask`) and add the `ClipboardList` icon import from lucide-react.

### Technical Details

- Tasks are created using the existing `addTask()` from `useTasks()` hook, ensuring activity logging and staff activity logging happen automatically
- Each task is linked to its lead via both `lead_id` and `related_entity_id` + `related_entity_type: "lead"` for full visibility in lead profile tabs
- The same batched processing pattern (batch size 10, `Promise.allSettled`, progress indicator) is used for consistency and performance
- No database changes are needed since the `tasks` table already supports all required fields

