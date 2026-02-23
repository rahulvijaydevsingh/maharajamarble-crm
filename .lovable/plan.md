
# Comprehensive Fix Plan: Dialog Freezes, Scrolling, Password, and Automation

## Root Cause Analysis

### The Global Dialog Freeze Problem
The page-freeze issue has a single root cause affecting the entire CRM: **Radix UI's Dialog component leaves `pointer-events: none` on `document.body` when dialogs unmount in certain sequences.**

When a dialog closes:
1. Radix sets `document.body.style.pointerEvents = 'none'` during close animation
2. If the dialog component unmounts before the animation completes (e.g., `{selectedLead && <Dialog>}` becomes false), the cleanup never fires
3. The body remains stuck with `pointer-events: none`, making the entire page unresponsive

This affects: LeadDetailView, BulkActionDialog, StaffManagement dialogs, and any dialog conditionally rendered with `{condition && <Dialog>}`.

### Other Issues
- **Double scrollbar**: `DialogContent` has default overflow + inner scroll div both scrolling
- **Password reset**: Supabase Auth rejects common/weak passwords beyond our validation. No client-side feedback shown.
- **Automation entity_type error**: DB CHECK constraint allows only 5 entity types but TypeScript defines 7 (added `kit` and `staff_activity`)
- **Nested dialogs behind profile**: `AddQuotationDialog`/`AddReminderDialog` rendered inside `LeadDetailView` Dialog causes Radix focus-trap conflicts

---

## Implementation Plan

### Step 1: Fix the Global Dialog Freeze (Root Cause Fix in dialog.tsx)

**File: `src/components/ui/dialog.tsx`**

Add a safety cleanup to `DialogContent` via `onCloseAutoFocus` and `onOpenAutoFocus` callbacks. Also add a global `useEffect` cleanup that ensures `document.body.style` is reset when any Dialog unmounts:

```tsx
// Add onCloseAutoFocus to DialogContent to guarantee body cleanup
onCloseAutoFocus={(e) => {
  document.body.style.pointerEvents = '';
  props.onCloseAutoFocus?.(e);
}}
```

Also create a small `useDialogBodyCleanup` hook that runs on unmount to reset body styles. Apply it inside `DialogContent`.

### Step 2: Fix EnhancedLeadTable Dialog Management

**File: `src/components/leads/EnhancedLeadTable.tsx`**

Key changes:
- Remove the `{selectedLead && (...)}` conditional wrapper around all dialogs. Instead, always render the dialogs and pass `selectedLead` data only when available
- Add proper `onOpenChange` handlers that clean up `selectedLead` AFTER the dialog close animation completes (using a small setTimeout)
- For the `LeadDetailView`, change `onOpenChange` to:
```tsx
onOpenChange={(open) => {
  setDetailViewOpen(open);
  if (!open) {
    setTimeout(() => setSelectedLead(null), 200);
  }
}}
```
- Same pattern for bulk action dialog: reset `bulkActionType`, `bulkActionValue`, and `selectedLeads` in a proper cleanup

### Step 3: Fix LeadDetailView - Lift Nested Dialogs Out

**File: `src/components/leads/LeadDetailView.tsx`**

The quotation and reminder dialogs rendered inside tab content (inside the parent Dialog) cause Radix focus-trap conflicts. Fix by:
- Adding state for `addQuotationOpen`, `addReminderOpen`, `addTaskOpen` at the LeadDetailView level
- Passing `onOpenQuotation`, `onOpenReminder`, `onOpenTask` callbacks to tab components
- Rendering child dialogs as siblings AFTER the parent `</Dialog>`, not nested inside it:

```tsx
return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        {/* tabs - no dialogs nested inside */}
      </DialogContent>
    </Dialog>
    {/* Child dialogs as siblings */}
    <AddQuotationDialog open={addQuotationOpen} ... />
    <AddReminderDialog open={addReminderOpen} ... />
    <AddTaskDialog open={addTaskOpen} ... />
  </>
);
```

### Step 4: Fix Tab Components to Use Callbacks Instead of Internal Dialogs

**Files:**
- `src/components/leads/detail-tabs/LeadQuotationsTab.tsx`
- `src/components/leads/detail-tabs/LeadRemindersTab.tsx`  
- `src/components/leads/detail-tabs/LeadTasksTab.tsx`

Change each tab to accept an `onOpenAddDialog` callback prop instead of managing its own Dialog component internally. Remove the internal `<AddQuotationDialog>`, `<AddReminderDialog>`, `<AddTaskDialog>` from these tabs.

### Step 5: Fix Double Scrollbar in Bulk Upload

**File: `src/components/leads/BulkUploadDialog.tsx`**

The issue: `DialogContent` has `max-h-[90vh] flex flex-col` which creates an outer scroll context, AND the inner validation div has `overflow-auto` with `max-height: 50vh`. Both create scroll regions.

Fix:
- Set the `DialogContent` to `overflow-hidden` (no outer scroll)
- Keep only the inner validation table div as the single scroll container
- Set the inner container to `overflow-auto` with a calculated max-height

### Step 6: Fix Password Reset - Add Requirements UI

**File: `src/components/settings/StaffManagementPanel.tsx`**

Add password strength validation and requirements display:
- Show real-time password requirements checklist below the password input:
  - Min 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - Not a commonly guessed password
- Disable the "Reset Password" button until all requirements are met
- Catch `AuthWeakPasswordError` specifically and show a user-friendly message
- Ensure `finally` block always resets `isResetSubmitting`
- Apply same password requirements UI to the "Add Staff" form

### Step 7: Fix Automation Rules Entity Type Constraint

**Database migration:**

Update the CHECK constraint on `automation_rules.entity_type` to include the new entity types:

```sql
ALTER TABLE automation_rules 
  DROP CONSTRAINT automation_rules_entity_type_check;
ALTER TABLE automation_rules 
  ADD CONSTRAINT automation_rules_entity_type_check 
  CHECK (entity_type = ANY (ARRAY[
    'leads', 'tasks', 'customers', 'professionals', 
    'quotations', 'kit', 'staff_activity'
  ]));
```

### Step 8: Fix Staff Management Dialog Freezes

**File: `src/components/settings/StaffManagementPanel.tsx`**

Apply the same dialog cleanup pattern:
- For the dropdown-to-dialog pattern, close the dropdown first with a small delay before opening the dialog
- Ensure all `onOpenChange` handlers reset ALL related states
- Add body cleanup on dialog unmount

### Step 9: Fix Bulk Action Cancel Freeze

**File: `src/components/leads/EnhancedLeadTable.tsx`**

The bulk action dialog's cancel button sets state but the dialog close may race with Radix cleanup. Fix:
- Always render the bulk action Dialog (remove conditional)
- On cancel/close, explicitly reset: `bulkActionType`, `bulkActionValue`, `bulkActionProgress`
- Do NOT clear `selectedLeads` on cancel (only clear on successful completion)

### Step 10: Global Dialog Safety Net

**File: `src/components/ui/dialog.tsx`**

Add a global click listener as a safety net: if `document.body.style.pointerEvents === 'none'` and no open dialog exists in the DOM, auto-reset it. This prevents any edge case from permanently freezing the UI.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/dialog.tsx` | Add `onCloseAutoFocus` body cleanup, unmount safety reset |
| `src/components/leads/EnhancedLeadTable.tsx` | Remove conditional dialog rendering, fix `onOpenChange` handlers, fix bulk action dialog |
| `src/components/leads/LeadDetailView.tsx` | Lift child dialogs as siblings, add dialog state management |
| `src/components/leads/detail-tabs/LeadQuotationsTab.tsx` | Accept callback prop, remove internal dialog |
| `src/components/leads/detail-tabs/LeadRemindersTab.tsx` | Accept callback prop, remove internal dialog |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Accept callback prop, remove internal dialog |
| `src/components/leads/BulkUploadDialog.tsx` | Fix double scrollbar - single scroll container |
| `src/components/settings/StaffManagementPanel.tsx` | Add password requirements UI, fix dialog cleanup |
| `src/components/customers/CustomerDetailView.tsx` | Same nested dialog fix as LeadDetailView |
| `src/components/professionals/ProfessionalDetailView.tsx` | Verify sibling dialog pattern is correct |
| Database migration | Update `automation_rules_entity_type_check` constraint |

### Implementation Order

1. Database: Update automation CHECK constraint (unblocks automation rule creation)
2. `dialog.tsx`: Add global body cleanup safety mechanism
3. `EnhancedLeadTable.tsx`: Fix conditional rendering and dialog close handlers
4. `LeadDetailView.tsx`: Lift nested dialogs out as siblings
5. Tab components: Remove internal dialogs, use callbacks
6. `BulkUploadDialog.tsx`: Fix double scrollbar
7. `StaffManagementPanel.tsx`: Add password requirements + dialog cleanup
8. `CustomerDetailView.tsx`: Same nested dialog fix
9. Verify `ProfessionalDetailView.tsx` has correct pattern
