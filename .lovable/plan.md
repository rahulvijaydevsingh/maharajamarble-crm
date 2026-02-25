

# Fix Plan: Activity Log Freeze, Field Agent Gray Screen, Staff Activity Logging, and Security

## Issues Identified

### 1. Activity Log Delete Freezes Page
**Root cause**: The `AlertDialog` component (`alert-dialog.tsx`) does NOT have the same `onCloseAutoFocus` body cleanup that was added to the `Dialog` component. When the delete confirmation AlertDialog closes, `document.body.style.pointerEvents` stays as `'none'`, freezing the page. The global safety net interval only catches this if the AlertDialog fully unmounts, which may not happen fast enough.

**Additionally**: The `onEdit` handler in `LeadActivityTab.tsx` line 219 is a no-op: `onEdit={() => {/* TODO: Implement edit dialog */}}`. Editing does nothing.

### 2. Field Agent Gray Screen
**Root cause**: After investigating, the field agent role (`field_agent`) IS properly recognized in the `AuthContext` role hierarchy and `ProtectedRoute`. The gray screen is almost certainly the same `pointer-events: none` stuck on `document.body` from a previous dialog interaction that persists across navigation. The console logs show `Failed to fetch` errors on `_refreshAccessToken`, indicating the field agent's auth token refresh is failing (possibly network-related), but the gray screen is the stuck pointer-events from Radix.

The fix: The `AlertDialog` component needs the same safety cleanup as the `Dialog` component. This is the missing piece causing freezes everywhere, including for field agents who trigger any alert dialog before their session.

### 3. Staff Activity Log Not Capturing Activities
**Root cause**: The `logStaffAction` function is defined in `useStaffActivityLog.ts` but is **never called anywhere** in the entire codebase. Zero components import or invoke it. The `staff_activity_log` table has only 1 record. No automatic logging happens for login, lead creation, task updates, etc.

### 4. Password Reset Error
The edge function `reset-staff-password` looks correct. The error "password is known to be weak" comes from Supabase Auth's HIBP (Have I Been Pwned) check which rejects passwords found in data breaches -- even if they pass complexity rules. The edge function returns the error message but the client-side doesn't clearly explain the HIBP rejection.

### 5. Security: xlsx Vulnerability
The `xlsx` package at `^0.18.5` has known CVEs (Prototype Pollution, ReDoS). Should be updated and file upload validation added.

---

## Implementation Steps

### Step 1: Fix AlertDialog Body Cleanup (Fixes Delete Freeze + Field Agent Gray Screen)

**File: `src/components/ui/alert-dialog.tsx`**

Add the same `onCloseAutoFocus` and unmount cleanup to `AlertDialogContent` that was added to `DialogContent`. This is the root fix for:
- Activity log delete freeze
- Field agent gray screen (from any AlertDialog that was previously opened)
- All other AlertDialog-triggered freezes

Changes:
- Add `useDialogBodyCleanup` hook (or create an `useAlertDialogBodyCleanup`) to `AlertDialogContent`
- Add `onCloseAutoFocus` handler that resets `document.body.style.pointerEvents` and `overflow`
- Add `onAnimationEnd` handler as additional safety

### Step 2: Add Edit Activity Dialog to LeadActivityTab

**File: `src/components/leads/detail-tabs/LeadActivityTab.tsx`**

- Add state for `activityToEdit` and `editDialogOpen`
- Wire the `onEdit` callback to set the selected activity and open the edit dialog
- Create a simple inline edit dialog with pre-filled title and description
- Use the existing `updateActivity` function from `useActivityLog` hook (it already exists at line 147 of useActivityLog.ts)
- Add proper body cleanup to the edit dialog's `onOpenChange`

### Step 3: Integrate Staff Activity Logging Across Key Components

The `useStaffActivityLog` hook has `logStaffAction` but it's never called. Add calls in these critical locations:

**File: `src/pages/Auth.tsx`**
- After successful login, call `logStaffAction('login', 'User logged in')`

**File: `src/components/shared/Header.tsx`**
- After successful logout, call `logStaffAction('logout', 'User logged out')`

**File: `src/pages/Leads.tsx`**
- After creating a lead, call `logStaffAction('create_lead', 'Created lead: [name]', 'leads', leadId)`

**File: `src/components/leads/EnhancedLeadTable.tsx`**
- After editing a lead, call `logStaffAction('update_lead', 'Updated lead: [name]', 'leads', leadId)`

**File: `src/pages/Customers.tsx`**  
- After creating a customer, call `logStaffAction('create_customer', ...)`

**File: `src/components/tasks/AddTaskDialog.tsx`**
- After creating a task, call `logStaffAction('create_task', ...)`

**File: `src/components/quotations/AddQuotationDialog.tsx`**
- After creating a quotation, call `logStaffAction('create_quotation', ...)`

Since `logStaffAction` requires auth context and the hook uses `useCallback`, it can only be called from within React components. The approach is to import `useStaffActivityLog` in each component and call `logStaffAction` after the successful Supabase operation.

### Step 4: Improve Password Reset Error Handling

**File: `src/components/settings/StaffManagementPanel.tsx`**

- In `handleResetPassword`, catch the specific HIBP error message and show a clear user-friendly toast: "This password has appeared in a data breach and is not allowed. Please choose a completely unique password."
- The password requirements UI already has the HIBP warning from the previous fix
- Add additional common passwords to the blocklist

**File: `src/hooks/useStaffManagement.ts`**

- In `resetPassword`, parse the error message from the edge function and return a more descriptive error when it's a HIBP rejection

### Step 5: Update xlsx Package and Add File Validation

**File: `package.json`**

- Update `xlsx` from `^0.18.5` to `^0.20.3` (patched version)

**Files: `src/components/leads/BulkUploadDialog.tsx` and `src/components/professionals/BulkProfessionalUploadDialog.tsx`**

- Add file size check (max 5MB) before `XLSX.read()`
- Add file extension validation (only `.xlsx`, `.xls`, `.csv`)

### Step 6: Fix CustomerActivityTab Delete AlertDialog (Same Pattern)

**File: `src/components/customers/detail-tabs/CustomerActivityTab.tsx`**

The customer activity tab has the same delete AlertDialog pattern. The global AlertDialog fix from Step 1 covers this, but also add explicit body cleanup in the delete handler's `finally` block.

### Step 7: Update Security Findings

After all fixes are applied, update the security scan findings to reflect the xlsx fix and mark the profiles finding with appropriate context.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/alert-dialog.tsx` | Add `onCloseAutoFocus` body cleanup + unmount safety hook (CRITICAL) |
| `src/components/leads/detail-tabs/LeadActivityTab.tsx` | Add edit dialog, wire edit handler, add body cleanup to delete handler |
| `src/pages/Auth.tsx` | Log login event to staff_activity_log |
| `src/components/shared/Header.tsx` | Log logout event |
| `src/pages/Leads.tsx` | Log lead creation |
| `src/components/leads/EnhancedLeadTable.tsx` | Log lead updates |
| `src/pages/Customers.tsx` | Log customer creation |
| `src/components/tasks/AddTaskDialog.tsx` | Log task creation |
| `src/components/quotations/AddQuotationDialog.tsx` | Log quotation creation |
| `src/components/settings/StaffManagementPanel.tsx` | Better HIBP error message |
| `src/hooks/useStaffManagement.ts` | Parse HIBP-specific errors |
| `package.json` | Update xlsx to ^0.20.3 |
| `src/components/leads/BulkUploadDialog.tsx` | Add file size/type validation |
| `src/components/professionals/BulkProfessionalUploadDialog.tsx` | Add file size/type validation |

### Implementation Priority

1. AlertDialog body cleanup (fixes delete freeze + field agent gray screen)
2. Activity log edit dialog
3. Staff activity logging integration
4. Password reset error handling improvement
5. xlsx update + file validation
6. Security findings update

