

# Fix Plan: Reminders Dialog, Password Reset, and Security

## Issues Found

### 1. Reminders Dialog Behind Profile Window
**Root cause**: `LeadRemindersTab` (line 201) uses its own internal `setAddDialogOpen(true)` and renders its own `AddReminderDialog` (line 331-336) INSIDE the parent Dialog. The `onOpenAddReminder` callback prop exists but is ignored -- the "Add Reminder" button never calls it.

The same pattern was correctly fixed for Quotations (the tab calls `onOpenAddQuotation` and has no internal dialog), but Reminders was missed.

Additionally, `CustomerDetailView` was never updated to use the sibling dialog pattern at all -- Reminders, Quotations, and Tasks tabs still render their own internal dialogs nested inside the parent Dialog.

### 2. Password Reset Error
**Root cause**: The `reset-staff-password` edge function has **zero logs** -- it was never successfully deployed/invoked. The error "password is known to be weak and easy to guess" comes from Supabase Auth's HIBP (Have I Been Pwned) check, which rejects passwords found in data breaches, even if they pass complexity rules.

The edge function needs redeployment. The client-side validation should also warn users about the HIBP check.

### 3. Security Findings
From the security scan:
- **Profiles table**: All authenticated users can see all profiles (emails, phones). Should restrict to own profile + admins (but need a safe way for staff dropdowns to still work).
- **KIT tables**: `kit_subscriptions` and `kit_touches` have `USING (true)` on all operations -- fully open to all authenticated users.
- **RLS always-true warnings**: Multiple tables have permissive INSERT/UPDATE/DELETE policies.

---

## Implementation Steps

### Step 1: Fix LeadRemindersTab -- Use Callback Instead of Internal Dialog

**File: `src/components/leads/detail-tabs/LeadRemindersTab.tsx`**

- Change the "Add Reminder" button (line 201) to call `onOpenAddReminder?.()` if available, falling back to internal dialog
- Remove the internal `AddReminderDialog` render (lines 331-336) when `onOpenAddReminder` is provided
- This makes the sibling dialog in `LeadDetailView` the one that actually opens (at z-[80])

### Step 2: Fix CustomerDetailView -- Apply Sibling Dialog Pattern

**File: `src/components/customers/CustomerDetailView.tsx`**

Apply the same pattern already done for `LeadDetailView`:
- Add lifted dialog states: `addQuotationOpen`, `addReminderOpen`, `addTaskOpen`
- Pass `onOpenAddQuotation`, `onOpenAddReminder`, `onOpenAddTask` callbacks to tab components
- Render `AddQuotationDialog`, `AddReminderDialog`, `AddTaskDialog` as siblings AFTER the parent Dialog with `z-[80]` and `hideOverlay` props

**Files: Customer tab components**
- `CustomerQuotationsTab.tsx`: Accept `onOpenAddQuotation` callback, use it for the "Create Quotation" button
- `CustomerRemindersTab.tsx`: Accept `onOpenAddReminder` callback, use it for the "Add Reminder" button, remove internal `AddReminderDialog`
- `CustomerTasksTab.tsx`: Accept `onOpenAddTask` callback if applicable

### Step 3: Redeploy Password Reset Edge Function

Redeploy `reset-staff-password` to ensure it's actually running.

### Step 4: Improve Password Reset UX

**File: `src/components/settings/StaffManagementPanel.tsx`**

- Add a note to the password requirements UI warning about the HIBP check: "Must not appear in known data breach databases"
- Add more common passwords to the blocklist
- Improve the error message when the backend rejects a password to explain HIBP clearly

### Step 5: Fix Security -- Profiles Table RLS

**Database migration:**

Create a minimal-fields view for staff lookups and restrict the profiles table:

```sql
-- Create a safe view for staff dropdowns (id + full_name only)
CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = on) AS
SELECT id, full_name FROM public.profiles WHERE is_active = true;

-- Restrict profiles to own profile + admins
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR is_admin());
```

Note: The `is_assigned_to_me()` function uses `SECURITY DEFINER`, so it bypasses RLS and will continue working even with restricted profiles SELECT. Staff dropdowns (`useActiveStaff`) query profiles directly, so they need updating to use the `staff_directory` view OR the query needs to be done via an RPC. Since `useActiveStaff` is used widely, the safest approach is to keep profiles readable but only expose id/full_name/is_active via a view, and restrict direct table access.

However, restricting profiles would break `useActiveStaff` and many other features. The pragmatic fix: keep profiles readable by authenticated users (it's a CRM where staff need to see each other's names for assignment), but mark the finding as an accepted risk with justification.

### Step 6: Fix Security -- KIT Tables RLS

**Database migration:**

Replace the overly permissive `USING (true)` policies on `kit_subscriptions` and `kit_touches` with assignment-based policies using `is_assigned_to_me()`:

```sql
-- kit_subscriptions
DROP POLICY IF EXISTS "Users can view all subscriptions" ON public.kit_subscriptions;
DROP POLICY IF EXISTS "Users can update subscriptions" ON public.kit_subscriptions;
DROP POLICY IF EXISTS "Users can delete subscriptions" ON public.kit_subscriptions;

CREATE POLICY "Users can view accessible subscriptions"
ON public.kit_subscriptions FOR SELECT USING (
  is_assigned_to_me(assigned_to) OR is_assigned_to_me(created_by) OR is_admin()
);

CREATE POLICY "Users can update accessible subscriptions"
ON public.kit_subscriptions FOR UPDATE USING (
  is_assigned_to_me(assigned_to) OR is_assigned_to_me(created_by) OR is_admin()
);

CREATE POLICY "Admins can delete subscriptions"
ON public.kit_subscriptions FOR DELETE USING (is_admin());

-- kit_touches: similar pattern
```

### Step 7: Update Security Scan Findings

Mark findings with appropriate status after fixes are applied.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/leads/detail-tabs/LeadRemindersTab.tsx` | Use `onOpenAddReminder` callback, remove internal dialog |
| `src/components/customers/CustomerDetailView.tsx` | Lift child dialogs as siblings with z-[80] |
| `src/components/customers/detail-tabs/CustomerRemindersTab.tsx` | Accept callback, remove internal dialog |
| `src/components/customers/detail-tabs/CustomerQuotationsTab.tsx` | Accept callback, remove internal dialog |
| `src/components/settings/StaffManagementPanel.tsx` | Add HIBP warning to password requirements |
| Database migration | Fix KIT tables RLS policies |

## Implementation Order

1. Database: Fix KIT tables RLS (security)
2. Redeploy `reset-staff-password` edge function
3. Fix `LeadRemindersTab` to use callback
4. Fix `CustomerDetailView` with sibling dialog pattern
5. Fix customer tab components
6. Improve password reset UX with HIBP warning
7. Update security findings

