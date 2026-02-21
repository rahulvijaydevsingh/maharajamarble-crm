
# Fix Plan: Critical Bugs - Dialogs, RLS, Bulk Operations, Global Search, and Automation

## Issues Identified

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Quotation/Reminder dialogs behind profile window | Nested Radix Dialog modals cause focus-trap conflicts. Even with z-index fixes, the parent modal intercepts pointer events. Child dialogs must be rendered as siblings, not nested inside the parent. |
| 2 | Reset password still errors | Edge function has zero logs -- it was never actually invoked. The `reset-staff-password` function needs redeployment and the error handling in `useStaffManagement.ts` needs to extract the real error from the response body. |
| 3 | Bulk upload list not scrollable | The `ScrollArea` has `max-h-[400px]` but the parent `DialogContent` constrains it further. The entire validation step needs explicit height management. |
| 4 | Bulk lead import: 0 Created, 118 Errors | **Root cause found:** `created_by` is hardcoded to `"Bulk Import"` (line 583). The RLS INSERT policy requires `created_by = get_current_user_email()`. Since `"Bulk Import"` does not equal the user's email, non-admin users are blocked by RLS. |
| 5 | Field agent can't see leads assigned by admin via bulk update | **Root cause found:** `assigned_to` stores staff display NAMES (e.g., "Mandeep singh") but RLS uses `get_current_user_email()` which returns the EMAIL. The comparison `assigned_to = get_current_user_email()` always fails because name != email. This affects ALL entity visibility. |
| 6 | Edit staff dialog cancel freezes page | Dialog `onOpenChange` doesn't reliably reset internal states. Multiple dialogs share the `selectedStaff` state without proper cleanup. |
| 7 | Bulk action (delete/reassign) freezes system | `handleBulkAction` runs sequential async operations in a for-loop with no progress indicator, no error boundaries, and no batching. Large selections block the UI thread. |
| 8 | Global search bar non-functional | The search Input in the Header is a static element with no logic attached. |
| 9 | Automation: Can't trigger based on "task count = 0" for leads | The leads entity fields don't include cross-entity relationship fields like task count. |
| 10 | Automation: Can't select staff member in staff_activity entity | The `user_email` field in staff_activity has no dropdown options populated from the database. |

---

## CRITICAL FIX: assigned_to Name vs Email Mismatch (Issue #5)

This is the highest-priority fix because it affects ALL RLS policies across leads, tasks, customers, professionals, and reminders. The `assigned_to` column stores display names but RLS compares against `get_current_user_email()`.

**Fix approach:** Do NOT change the `assigned_to` column data (it's used for display everywhere). Instead, modify RLS policies to compare using a helper function that resolves names to emails via the profiles table.

Create a database function `is_assigned_to_me(assigned_to_value text)` that checks if the given name or email matches the current user by looking up the profiles table:

```sql
CREATE OR REPLACE FUNCTION public.is_assigned_to_me(assigned_to_value text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      full_name = assigned_to_value
      OR email = assigned_to_value
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

Then update RLS policies on leads, tasks, customers, professionals, and reminders to use `is_assigned_to_me(assigned_to)` instead of `assigned_to = get_current_user_email()`.

## Implementation Details

### 1. Fix Dialog Stacking (Nested Modal Problem)

**File:** `src/components/professionals/ProfessionalDetailView.tsx`

The fix is to lift child dialogs (AddQuotationDialog, AddReminderDialog, AddTaskDialog, EditTaskDialog) out of the tab content and render them as siblings AFTER the parent Dialog closes its tag. This avoids nested Radix modal conflicts entirely.

- Move dialog open states (`addDialogOpen`, `addReminderOpen`, `addTaskOpen`, etc.) from the tab components up to the `ProfessionalDetailView` component
- Pass callbacks like `onOpenAddQuotation`, `onOpenAddReminder`, etc. down to tab components
- Render all child dialogs OUTSIDE the parent `<Dialog>` as siblings:

```tsx
return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        {/* tabs content - no dialogs inside */}
      </DialogContent>
    </Dialog>
    
    {/* Child dialogs rendered as siblings, not nested */}
    <AddQuotationDialog open={addQuotationOpen} onOpenChange={setAddQuotationOpen} ... />
    <AddReminderDialog open={addReminderOpen} onOpenChange={setAddReminderOpen} ... />
    <AddTaskDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} ... />
  </>
);
```

### 2. Fix Bulk Lead Import RLS Error

**File:** `src/components/leads/BulkUploadDialog.tsx`

Remove the hardcoded `created_by: "Bulk Import"` from the insert call (line 583). Let the database default `get_current_user_email()` handle it. This ensures the RLS INSERT policy check passes for all users.

```typescript
// Before:
created_by: "Bulk Import",

// After: Remove this line entirely (database default handles it)
```

Also add the bulk import source info to the `notes` field instead:
```typescript
notes: lead.notes ? `${lead.notes} [Bulk Import]` : '[Bulk Import]',
```

### 3. Fix RLS assigned_to Matching

**Database migration:**

1. Create helper function `is_assigned_to_me(text)` that matches both name and email
2. Update SELECT/UPDATE RLS policies on: leads, tasks, customers, professionals, reminders
3. Also update `created_by` comparison to handle the same name/email mismatch

Updated policy example for leads SELECT:
```sql
DROP POLICY "Users can view assigned or created leads" ON public.leads;
CREATE POLICY "Users can view assigned or created leads" ON public.leads
  FOR SELECT USING (
    is_assigned_to_me(assigned_to)
    OR is_assigned_to_me(created_by)
    OR is_admin()
  );
```

### 4. Fix Bulk Upload Scrollability

**File:** `src/components/leads/BulkUploadDialog.tsx`

The DialogContent needs explicit height control and the validation table needs proper overflow:

- Change the validation step container to use `min-h-0` and `max-h-[60vh]`
- Ensure ScrollArea has both vertical and horizontal scroll with `overflow-auto`
- Wrap the table in `overflow-x-auto` div (already exists but needs min-width on table)
- Add `min-w-[1200px]` to the Table to force horizontal scroll

### 5. Fix Staff Dialog Freeze Issues

**File:** `src/components/settings/StaffManagementPanel.tsx`

- Add `finally` blocks to all dialog handlers that reset state
- Ensure `onOpenChange` handlers explicitly reset ALL related states:
```typescript
onOpenChange={(o) => {
  setEditDialogOpen(o);
  if (!o) {
    setIsEditSubmitting(false);
    setSelectedStaff(null);  // Clear selected staff on close
  }
}}
```
- Apply same pattern to ALL dialogs (add, edit, reset password, deactivate, delete)

### 6. Fix Bulk Action Freeze

**File:** `src/components/leads/EnhancedLeadTable.tsx`

- Add a progress state for bulk operations
- Use `Promise.allSettled` with batching instead of sequential for-loop
- Add loading indicator during bulk operations
- Wrap in try/catch with proper error counting
- Add async batching (process 10 at a time)

### 7. Redeploy Reset Password Function

Redeploy `reset-staff-password` edge function. Also fix the error extraction in `useStaffManagement.ts` to properly parse the edge function response:

```typescript
const { data, error } = await supabase.functions.invoke("reset-staff-password", {
  body: { user_id: userId, new_password: newPassword },
});
if (error) {
  // Extract detailed error from response body
  let msg = error.message;
  try {
    const body = await (error as any).context?.json();
    if (body?.error) msg = body.error;
  } catch {}
  throw new Error(msg);
}
if (data?.error) throw new Error(data.error);
```

### 8. Implement Global Search

**File:** `src/components/shared/Header.tsx`

Transform the search Input into a functional global search:

- Add search state and debounced query
- On input, search across leads (name, phone, email), customers (name, phone), professionals (name, phone, firm), tasks (title), quotations (quotation_number, client_name)
- Show results in a dropdown below the search bar using Popover
- Each result shows entity type icon, name, and secondary info
- Clicking a result navigates to the entity's detail page
- Limit to 5 results per entity type (25 total max)
- Add keyboard navigation (arrow keys, Enter to select, Escape to close)

### 9. Add Cross-Entity Fields for Automation

**File:** `src/constants/automationConstants.ts`

Add computed/relationship fields to the leads entity:
```typescript
{ name: "task_count", label: "Associated Task Count", type: "number", editable: false },
{ name: "reminder_count", label: "Associated Reminder Count", type: "number", editable: false },
{ name: "quotation_count", label: "Associated Quotation Count", type: "number", editable: false },
{ name: "days_without_task", label: "Days Without Any Task", type: "number", editable: false },
```

This allows triggers like "When task_count equals 0, create a follow-up task."

### 10. Add Staff Selection for Staff Activity Automation

**File:** `src/constants/automationConstants.ts`

The `user_email` field in the `staff_activity` entity needs dynamic options from the database. Since constants can't make DB calls, change the field type and handle it in the TriggerConditionBlock:

**File:** `src/components/automation/TriggerConditionBlock.tsx`

When entity type is `staff_activity` and the selected field is `user_email`, render a staff member dropdown using `useActiveStaff()` hook instead of a text input.

---

## Database Changes Required

1. Create `is_assigned_to_me(text)` function
2. Update RLS policies on 5 tables (leads, tasks, customers, professionals, reminders) for SELECT and UPDATE commands to use the new function

## Edge Function Actions

- Redeploy `reset-staff-password`

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/professionals/ProfessionalDetailView.tsx` | Lift child dialogs out of parent Dialog as siblings |
| `src/components/leads/BulkUploadDialog.tsx` | Remove hardcoded `created_by`, fix scroll container heights |
| `src/components/settings/StaffManagementPanel.tsx` | Fix dialog onOpenChange handlers to reset all states |
| `src/hooks/useStaffManagement.ts` | Fix resetPassword error extraction |
| `src/components/leads/EnhancedLeadTable.tsx` | Add batching and progress to bulk actions |
| `src/components/shared/Header.tsx` | Implement global search with multi-entity query and dropdown |
| `src/constants/automationConstants.ts` | Add cross-entity fields (task_count etc.) and staff options |
| `src/components/automation/TriggerConditionBlock.tsx` | Add staff dropdown for staff_activity entity |

## Implementation Order

1. **Database:** Create `is_assigned_to_me()` function and update RLS policies (fixes visibility for ALL users)
2. **Bulk import:** Remove hardcoded `created_by` (fixes 118-error import failure)
3. **Dialog stacking:** Lift child dialogs out of parent modal
4. **Staff dialogs:** Fix freeze on cancel/close
5. **Redeploy** reset-staff-password edge function
6. **Bulk upload scroll:** Fix container heights
7. **Bulk actions:** Add batching and progress indicator
8. **Global search:** Implement multi-entity search in header
9. **Automation:** Add cross-entity fields and staff dropdown
