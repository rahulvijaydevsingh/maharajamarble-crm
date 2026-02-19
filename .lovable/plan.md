# Fix Plan: Dialog Stacking, Excel Upload, Staff Management, and Staff Activity Log

## Issues Identified


| #   | Issue                                                                     | Root Cause                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add Quotation / Add Reminder dialogs open behind the Professional profile | Professional Detail View uses `z-[70]`, but AddQuotationDialog and AddReminderDialog use default `z-50`. Nested dialogs need higher z-index.                                                                                            |
| 2   | Staff edit/reset password causes page unresponsiveness                    | The `isSubmitting` state is shared across all staff dialogs. If one fails, it can block others. Also, dialog `onOpenChange` doesn't reset `isSubmitting`.                                                                               |
| 3   | Reset password error                                                      | The `reset-staff-password` edge function may not be deployed or has issues with the auth check.                                                                                                                                         |
| 4   | No delete staff option                                                    | Only deactivate/activate exists. Need a proper deletion workflow with responsibility transfer.                                                                                                                                          |
| 5   | No staff activity log                                                     | Not implemented. Need a comprehensive audit trail for all staff actions.with intigraton in workflow [automations. so](http://automations.so) that an automation can be created based of activity log.                                   |
| 6   | Excel upload "Name/Phone/Source required" error                           | The parser uses `getColumnValue()` with exact header matching (`"Name*"`, `"Name"`, `"Phone*"`, `"Phone"`, `"Source*"`, `"Source"`), but user's file has uppercase headers (`NAME`, `PHONE`, `SOURCE`). The matching is case-sensitive. |


---

## Technical Implementation

### 1. Fix Dialog Z-Index Stacking (Professional Profile)

**File:** `src/components/professionals/ProfessionalDetailView.tsx`

The ProfessionalDetailView's DialogContent uses `z-[70]`. Child dialogs (AddQuotationDialog, AddReminderDialog, AddTaskDialog, EditTaskDialog) all render their own `<Dialog>` which creates a new portal at `z-50`. Since `z-50 < z-70`, they appear behind the profile.

**Fix:** Wrap the child dialogs' `DialogContent` with a higher z-index. Since we can't easily modify AddQuotationDialog and AddReminderDialog without breaking them elsewhere, the solution is:

- Add a CSS class `z-[80]` to the `AddQuotationDialog`'s DialogContent (via a wrapper or by modifying the component to accept a className prop)
- Or, lower the ProfessionalDetailView's z-index and use `modal={false}` to prevent focus trapping, then let child dialogs render above
- **Best approach:** Add a `className` prop to `AddQuotationDialog` and `AddReminderDialog`'s DialogContent, and pass `z-[80]` from the Professional view. Alternatively, modify the Dialog component's portal container.

**Simplest fix:** Change the ProfessionalDetailView to not trap focus when sub-dialogs are open. Use Radix's `modal={false}` on the parent Dialog when a child dialog is open, OR wrap sub-dialogs in their own DialogPortal with higher z-index.

**Recommended approach:** Add a `containerClassName` prop to `AddQuotationDialog` and `AddReminderDialog` to allow higher z-index from parent contexts. Pass `"z-[80]"` when used inside ProfessionalDetailView.

### 2. Fix Excel Upload Header Matching

**File:** `src/components/leads/BulkUploadDialog.tsx`

The `getColumnValue` function at line 384 does exact string matching. The user's Excel has headers like `NAME`, `PHONE`, `E MAIL`, `SOURCE`, `ADDRESS`, `PRIORTY`, `ASSIGNED`, `MATERIAL`.

**Fix:** Make `getColumnValue` case-insensitive and add more header variations:

```typescript
const getColumnValue = (row: Record<string, any>, possibleHeaders: string[]): string => {
  // First try exact match
  for (const header of possibleHeaders) {
    if (row[header] !== undefined && row[header] !== null && row[header] !== "") {
      return row[header].toString().trim();
    }
  }
  // Then try case-insensitive match
  const rowKeys = Object.keys(row);
  for (const header of possibleHeaders) {
    const headerLower = header.toLowerCase().replace(/[*\s]/g, '');
    const match = rowKeys.find(k => k.toLowerCase().replace(/[*\s]/g, '') === headerLower);
    if (match && row[match] !== undefined && row[match] !== null && row[match] !== "") {
      return row[match].toString().trim();
    }
  }
  return "";
};
```

Also add more header variations to each `getColumnValue` call:

- Name: `["Name*", "Name", "NAME", "name", "Full Name", "FULL NAME"]`
- Phone: `["Phone*", "Phone", "PHONE", "phone", "Mobile", "MOBILE", "Contact"]`
- Source: `["Source*", "Source", "SOURCE", "source", "Lead Source"]`
- Email: `["Email", "EMAIL", "email", "E MAIL", "E-Mail", "e mail"]`
- Materials: `["Materials", "MATERIALS", "Material", "MATERIAL"]`
- Address: `["Address", "ADDRESS", "address"]`
- Priority: `["Priority", "PRIORITY", "PRIORTY", "priority"]`
- Assigned To: `["Assigned To", "ASSIGNED TO", "Assigned", "ASSIGNED", "assigned"]`

### 3. Fix Staff Management Unresponsiveness

**File:** `src/components/settings/StaffManagementPanel.tsx`

Issues:

- `isSubmitting` is a single shared state for all dialogs. If edit fails, reset password button is also disabled.
- Dialog `onOpenChange` handlers don't reset `isSubmitting`.

**Fix:**

- Use separate submitting states per dialog: `isAddSubmitting`, `isEditSubmitting`, `isResetSubmitting`, `isDeactivateSubmitting`
- Ensure `onOpenChange` handlers reset the corresponding submitting state
- Add proper error handling with finally blocks

### 4. Add Delete Staff with Responsibility Transfer

**File:** `src/hooks/useStaffManagement.ts` and `src/components/settings/StaffManagementPanel.tsx`

**Workflow:**

1. Admin clicks "Delete Staff" from the actions dropdown
2. A multi-step dialog opens:
  - Step 1: Shows staff's current responsibilities (assigned leads, tasks, customers, professionals)
  - Step 2: Select a target staff member to transfer all responsibilities to
  - Step 3: Confirm deletion
3. On confirm:
  - Transfer all `assigned_to` references in leads, tasks, customers, professionals, reminders
  - Log the transfer in activity_log
  - Delete the user via a new edge function `delete-staff-user`

**New Edge Function:** `supabase/functions/delete-staff-user/index.ts`

- Validates admin role
- Transfers all entity assignments to target user
- Deletes user_roles entry
- Deactivates profile (soft delete - keeps data for audit)
- Optionally deletes auth user via admin API

### 5. Staff Activity Log

**Database:** Create a new `staff_activity_log` table:

```sql
CREATE TABLE public.staff_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action_type text NOT NULL, -- 'login', 'logout', 'create_lead', 'update_task', etc.
  action_description text,
  entity_type text, -- 'lead', 'task', 'customer', etc.
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins and managers (with permission) can view
CREATE POLICY "Admins can view all staff activity" ON public.staff_activity_log
  FOR SELECT USING (is_admin());

-- System/authenticated users can insert their own activity
CREATE POLICY "Users can log own activity" ON public.staff_activity_log
  FOR INSERT WITH CHECK (true);

-- Admins can delete old logs
CREATE POLICY "Admins can delete staff activity" ON public.staff_activity_log
  FOR DELETE USING (is_admin());
```

**Client-side logging hook:** `src/hooks/useStaffActivityLog.ts`

- `logStaffAction(actionType, description, entityType?, entityId?, metadata?)`
- Auto-captures login/logout events from AuthContext
- Called from key CRM actions (create lead, update task, etc.)

**Admin UI:** Add a "Staff Activity" tab in Settings that shows:

- Filterable table by staff member, action type, date range
- Timeline view of all actions
- Export capability

---

## Files to Create


| File                                            | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `supabase/functions/delete-staff-user/index.ts` | Edge function to handle staff deletion with responsibility transfer |
| `src/hooks/useStaffActivityLog.ts`              | Hook for logging and querying staff activity                        |


## Files to Modify


| File                                                      | Changes                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/professionals/ProfessionalDetailView.tsx` | Fix z-index for sub-dialogs (Quotation, Reminder, Task)                     |
| `src/components/quotations/AddQuotationDialog.tsx`        | Accept optional className prop for z-index override                         |
| `src/components/leads/detail-tabs/AddReminderDialog.tsx`  | Accept optional className prop for z-index override                         |
| `src/components/leads/BulkUploadDialog.tsx`               | Case-insensitive header matching with more variations                       |
| `src/components/settings/StaffManagementPanel.tsx`        | Separate submitting states, add delete staff workflow, fix unresponsiveness |
| `src/hooks/useStaffManagement.ts`                         | Add deleteStaff function with responsibility transfer                       |
| `src/contexts/AuthContext.tsx`                            | Log login/logout to staff_activity_log                                      |
| `src/pages/Settings.tsx`                                  | Add Staff Activity tab                                                      |


## Database Changes

- Create `staff_activity_log` table with RLS policies (admin-only read, authenticated insert)

## Implementation Order

1. Fix Excel upload header matching (case-insensitive)
2. Fix dialog z-index stacking for nested dialogs
3. Fix staff management dialog unresponsiveness (separate submitting states)
4. Create staff_activity_log table with RLS
5. Implement staff activity logging hook
6. Add delete staff workflow with responsibility transfer
7. Add Staff Activity admin UI tab