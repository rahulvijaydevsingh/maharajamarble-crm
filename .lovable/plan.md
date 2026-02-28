

## Plan: HR Payroll Module + Fix HR Sidebar Visibility + Fix API Docs Access

### Overview
This plan covers 5 areas: (1) Fix HR module visibility in sidebar, (2) Fix API docs opening in new window requiring re-login, (3) Build the complete payroll feature (Part 5), (4) Update API docs and backup system for HR endpoints, (5) End-to-end testing.

---

### Issue 1: HR Module Not Visible in Sidebar

**Root Cause**: The HR nav items (Attendance, My Leave, Leave Approvals) are appended inside the "Main" navigation group but gated by `hrEnabled && role !== "sales_viewer"`. From the screenshot, there is no HR section visible -- the HR module toggle may be OFF, or the items are buried at the bottom of the Main list without a clear section header.

**Fix in `src/components/shared/Sidebar.tsx`**:
- Move HR nav items out of the `mainNavigation` list into a separate "HR" sidebar group (like the "Admin" group)
- Add a dedicated `SidebarGroupLabel` for "HR" that only renders when `hrEnabled` is true
- Add a "Payroll" nav item under the HR group (admin only)
- Ensure the HR group shows between Main and Admin groups

---

### Issue 2: API Docs Opens in New Window + Requires Login

**Root Cause**: In `ApiAccessPanel.tsx` line 129, the "View API Documentation" button uses `window.open("/api-docs", "_blank")` which opens a new browser tab. The new tab has no auth session in the preview iframe context, causing a redirect to `/auth`.

**Fix in `src/components/settings/ApiAccessPanel.tsx`**:
- Replace `window.open("/api-docs", "_blank")` with React Router's `useNavigate()` to navigate in-app: `navigate("/api-docs")`
- This keeps the user in the same authenticated session

---

### Issue 3: Database Migration for Payroll

The `salary_records` table exists but needs additional columns for the payroll feature:

```sql
ALTER TABLE public.salary_records
  ADD COLUMN IF NOT EXISTS days_lwp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_additions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_deductions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS finalized_by uuid;
```

- `days_lwp`: LWP days count
- `manual_additions`: `[{label, amount}]` array for bonuses/allowances
- `manual_deductions`: `[{label, amount}]` array for deductions/recoveries
- `finalized_at/finalized_by`: lock tracking

Also add admin DELETE policy for salary_records:
```sql
CREATE POLICY "Admins can delete salary records"
ON public.salary_records FOR DELETE TO authenticated
USING (public.is_admin());
```

---

### Issue 4: Edge Function `hr-generate-salary`

**File: `supabase/functions/hr-generate-salary/index.ts`**

For a given month + year:
1. Verify JWT, check admin role
2. Fetch all active staff from `profiles` (where `is_active = true`)
3. For each staff member:
   - Get `staff_hr_settings` (base_salary, work_days, shift times, overtime_rate)
   - Count `attendance_records` for the month by status (present, on_leave, absent)
   - Count LWP days from `leave_requests` (approved, type=lwp)
   - Calculate: OT hours from `attendance_records.overtime_hours` sum
   - Calculate: OT pay = OT hours x (base_salary / total_working_days / 8) x overtime_rate
   - Calculate: net_salary = base_salary - (base_salary / total_working_days x days_absent) + OT pay
   - Upsert into `salary_records`
4. Return summary: total payroll, staff count

**Config addition to `supabase/config.toml`**:
```toml
[functions.hr-generate-salary]
verify_jwt = false
```

---

### Issue 5: Payroll Page `src/pages/HRPayroll.tsx`

**Route: `/hr/payroll`** (admin only)

**Part A - Dashboard**:
- Month/year selector defaulting to current month
- "Generate Report" button calling the edge function
- Summary cards: Total Payroll, Staff Count, Average Salary

**Part B - Payroll Table**:
- Columns: Staff Name | Days Present | Leave (Paid) | LWP | Absent | OT Hours | Base Salary | OT Pay | Adjustments | Net Salary | Status | Actions
- Each row expandable to show day-by-day attendance breakdown
- Inline editing: click any salary figure to edit (with mandatory note)
- Manual additions/deductions: +/- buttons open small dialog for label + amount
- Edited values shown with pencil icon
- Status: Draft (editable) / Finalized (locked)
- "Finalize Month" button locks all draft records

**Part C - Export**:
- "Export Excel" button: generates .xlsx using the `xlsx` library (already installed)
  - Columns: Name, Designation, Days Present, Days Leave, Days LWP, Days Absent, OT Hours, Base, OT Pay, Additions, Deductions, Net Salary
- "Export PDF Payslips" and individual "Download PDF": generate a simple HTML-based PDF via `window.print()` styled payslip layout
  - Company header, staff details, month, attendance summary, earnings/deductions, net salary, signature line
- "Send via WhatsApp" not implemented (WhatsApp module not present) -- button hidden

---

### Issue 6: Update API Docs + Backup System

**API Docs (`src/pages/ApiDocs.tsx`)**:
- Add an "HR" section documenting the HR endpoints (attendance, leave, payroll)
- These are internal edge functions (not part of the external REST API), so document them as "Internal HR Endpoints" with their paths and expected payloads

**Backup System**: No changes needed -- backup operates on leads, customers, tasks, etc. HR data (attendance, leave, salary) is separate administrative data not typically included in CRM backups.

---

### Issue 7: Route and Navigation Updates

**`src/App.tsx`**:
- Add route: `/hr/payroll` with `ProtectedRoute requiredRole="admin"`
- Import `HRPayroll` page

**`src/components/shared/Sidebar.tsx`**:
- Restructure HR items into a dedicated sidebar group
- Add "Payroll" item (admin only, icon: Wallet/Banknote)

---

### File Summary

| Action | File |
|--------|------|
| Migration | Add `days_lwp`, `manual_additions`, `manual_deductions`, `finalized_at`, `finalized_by` to `salary_records` + delete policy |
| Create | `supabase/functions/hr-generate-salary/index.ts` |
| Create | `src/pages/HRPayroll.tsx` |
| Modify | `src/components/shared/Sidebar.tsx` (HR group + Payroll item) |
| Modify | `src/components/settings/ApiAccessPanel.tsx` (fix new window issue) |
| Modify | `src/App.tsx` (add payroll route) |
| Modify | `src/pages/ApiDocs.tsx` (add HR endpoints docs) |
| Modify | `supabase/config.toml` (add hr-generate-salary) |

### Implementation Order
1. Database migration (add salary_records columns)
2. Fix sidebar HR visibility + API docs navigation
3. Edge function (hr-generate-salary)
4. HRPayroll.tsx page
5. App.tsx routes + sidebar updates
6. API docs update

