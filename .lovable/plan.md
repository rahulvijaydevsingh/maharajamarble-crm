

## Plan: HR Module Foundation (Tables, Toggle, Context)

### Overview
Build the HR module foundation: database tables with RLS, a system settings table for the module toggle, a Settings UI toggle for admins, and a React context that conditionally shows/hides HR in the sidebar. No attendance UI is built yet.

---

### PART A -- Database Migration: `system_settings` table

Create a new `system_settings` table to store app-wide feature flags:

```text
system_settings
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  hr_module_enabled    BOOLEAN DEFAULT FALSE
  hr_module_toggled_by UUID REFERENCES profiles(id)
  hr_module_toggled_at TIMESTAMPTZ
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()
```

RLS:
- SELECT: all authenticated users
- INSERT/UPDATE: admin only (`is_admin()`)
- DELETE: none

Seed one default row so the setting always exists.

---

### PART B -- Database Migration: HR tables

All 7 tables created in a single migration:

**1. `staff_hr_settings`** -- per-staff salary/shift/GPS config
- Columns: `id`, `staff_id` (UUID, references profiles), `base_salary`, `salary_type` (monthly/daily), `shift_start`, `shift_end`, `work_days` (text[]), `gps_required` (bool), `office_latitude`, `office_longitude`, `gps_radius_meters`, `overtime_rate`, `created_at`, `updated_at`
- RLS: SELECT own row (`auth.uid() = staff_id`) OR admin. UPDATE/INSERT/DELETE admin only.

**2. `attendance_records`** -- daily clock-in/out
- Columns: `id`, `staff_id`, `date`, `clock_in`, `clock_out`, `clock_in_latitude`, `clock_in_longitude`, `clock_out_latitude`, `clock_out_longitude`, `status` (present/absent/half_day/late/on_leave), `total_hours`, `overtime_hours`, `notes`, `created_by`, `created_at`, `updated_at`
- RLS: SELECT own rows OR admin. INSERT admin only (edge function). UPDATE admin only.

**3. `leave_requests`** -- staff leave submissions
- Columns: `id`, `staff_id`, `leave_type` (casual/sick/earned/unpaid), `start_date`, `end_date`, `total_days`, `reason`, `status` (pending/approved/rejected), `approved_by`, `approved_at`, `rejection_reason`, `created_at`, `updated_at`
- RLS: SELECT own OR admin. INSERT own. UPDATE admin only.

**4. `leave_balances`** -- running balances per type per year
- Columns: `id`, `staff_id`, `year`, `leave_type`, `total_allowed`, `used`, `remaining`, `carry_forward`, `created_at`, `updated_at`
- RLS: SELECT own OR admin. INSERT/UPDATE/DELETE admin only.

**5. `work_delegations`** -- delegation audit trail
- Columns: `id`, `delegator_id`, `delegatee_id`, `start_date`, `end_date`, `reason`, `status` (active/completed/cancelled), `created_by`, `created_at`, `updated_at`
- RLS: SELECT own rows (as delegator or delegatee) OR admin. INSERT admin only.

**6. `salary_records`** -- monthly payroll snapshots
- Columns: `id`, `staff_id`, `month`, `year`, `base_salary`, `overtime_pay`, `deductions`, `bonuses`, `net_salary`, `total_working_days`, `days_present`, `days_absent`, `days_leave`, `status` (draft/finalized/paid), `notes`, `generated_by`, `generated_at`, `created_at`, `updated_at`
- RLS: SELECT own row (limited) OR admin (full). INSERT/UPDATE admin only.

**7. `public_holidays`** -- company holiday calendar
- Columns: `id`, `name`, `date`, `is_optional`, `created_at`, `updated_at`
- RLS: SELECT all authenticated. INSERT/UPDATE/DELETE admin only.

---

### PART C -- Settings Page: HR Module Toggle

**New file: `src/components/settings/HRModuleToggle.tsx`**

A card component rendered inside the existing "Control Panel" tab in `src/pages/Settings.tsx`:
- Fetches `system_settings` to get `hr_module_enabled`
- Renders title "HR Module -- Attendance, Leave & Payroll"
- Renders description text
- Large Switch toggle (only for super_admin/admin via `useAuth().role`)
- When OFF: grey Badge "Module Disabled"
- When ON: green Badge "Module Active" + date enabled
- On toggle: updates `system_settings`, logs to `activity_log` via `useLogActivity`

**Modified file: `src/pages/Settings.tsx`**
- Import and render `<HRModuleToggle />` below the existing `<ControlPanel />` inside the `control-panel` tab.

---

### PART D -- HRModuleContext + Conditional Sidebar

**New file: `src/contexts/HRModuleContext.tsx`**
- Creates `HRModuleContext` with `{ hrEnabled: boolean; loading: boolean }`
- Provider fetches `system_settings.hr_module_enabled` on mount
- Subscribes to realtime changes so toggle reflects instantly for all users
- Exports `useHRModule()` hook

**Modified file: `src/App.tsx`**
- Wrap app with `<HRModuleProvider>` inside `<AuthProvider>`

**Modified file: `src/components/shared/Sidebar.tsx`**
- Import `useHRModule()` and `useAuth()`
- If `hrEnabled` is true AND role is not `sales_viewer`, add an "HR" item to `mainNavigation` (using `Briefcase` icon, path `/hr`)
- No route/page created yet -- just the nav item

---

### File Summary

| Action | File |
|--------|------|
| Migration | `system_settings` table + seed row |
| Migration | 7 HR tables with full RLS |
| Create | `src/components/settings/HRModuleToggle.tsx` |
| Create | `src/contexts/HRModuleContext.tsx` |
| Modify | `src/pages/Settings.tsx` (add HRModuleToggle to control-panel tab) |
| Modify | `src/App.tsx` (wrap with HRModuleProvider) |
| Modify | `src/components/shared/Sidebar.tsx` (conditional HR nav item) |

