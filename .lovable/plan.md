

## Plan: Add HR Settings to Staff Management Panel

### Overview
Add an expandable "HR Settings" section to each staff member's row in the Staff Management Panel. This section includes salary/schedule config, attendance/location settings, and leave balance management. Only visible when HR module is enabled, only editable by Admin/Super Admin.

---

### PART 1 -- Database Migration: Add missing columns to `staff_hr_settings`

The existing table lacks several fields from the spec. Add via migration:

```sql
ALTER TABLE staff_hr_settings
  ADD COLUMN pf_applicable BOOLEAN DEFAULT false,
  ADD COLUMN salary_effective_from DATE,
  ADD COLUMN gps_mode TEXT NOT NULL DEFAULT 'flexible',
  ADD COLUMN camera_required BOOLEAN DEFAULT true;
```

`gps_mode` values: `'strict'`, `'flexible'`, `'exempt'`
This replaces the existing `gps_required` boolean with a richer selector. We keep `gps_required` for backward compatibility but the UI will use `gps_mode`.

---

### PART 2 -- New Component: `StaffHRSettingsPanel.tsx`

**File: `src/components/settings/StaffHRSettingsPanel.tsx`**

A self-contained component that receives a `staffId: string` and `staffRole: string | null` props.

**Sections:**

1. **Salary and Schedule**
   - Monthly Base Salary (number input, INR prefix)
   - Salary Type (select: monthly/daily) -- already in DB
   - Working Days (select: Mon-Fri / Mon-Sat / Custom with checkboxes)
   - Shift Start / Shift End (time inputs, defaults 09:00 / 18:00)
   - Overtime Rate (select: 1x / 1.5x / 2x)
   - PF Applicable (toggle)
   - Salary Effective From (date picker)

2. **Attendance and Location**
   - GPS Enforcement (select: Strict Office / Flexible Log Only / Exempt)
   - Location Radius (select: 50m / 200m / 500m / 1km) -- shown only when GPS mode is "strict"
   - Office/Base Location (lat/lng inputs + "Use Current Location" button) -- shown when mode is "strict" or "flexible"
   - Camera Required (toggle, always ON for field_agent role, exempt roles can toggle)

3. **Leave Allocation (current year)**
   - Fetch `leave_balances` for this staff + current year
   - Show table: leave_type | total_allowed | used | remaining
   - Admin can edit `total_allowed` for each type with a reason input
   - Adjustment logged to `activity_log`

**Save logic:**
- On save, upsert into `staff_hr_settings` (insert if not exists, update if exists)
- If this is the first save (new row), also auto-create `leave_balances` rows for current year: sick=12, casual=12, earned=15
- All writes go through the Supabase client (RLS ensures admin-only writes)

**Data loading:**
- On mount, fetch `staff_hr_settings` where `staff_id = staffId`
- Also fetch `leave_balances` where `staff_id = staffId AND year = currentYear`
- If no HR settings row exists, show defaults (empty form with sensible defaults)

---

### PART 3 -- Integrate into StaffManagementPanel

**File: `src/components/settings/StaffManagementPanel.tsx`**

Add a "HR Settings" option to the staff action dropdown menu (only shown when `hrEnabled` is true from `useHRModule()`).

Clicking it opens a Dialog containing the `StaffHRSettingsPanel` component for that staff member.

Changes:
- Import `useHRModule` and `StaffHRSettingsPanel`
- Add state: `hrSettingsDialogOpen`, `hrSettingsStaffId`, `hrSettingsStaffRole`
- Add dropdown menu item: "HR Settings" with a Briefcase icon (after "Edit Staff", before separator)
- Add Dialog rendering the `StaffHRSettingsPanel`

---

### PART 4 -- Update Supabase types

After the migration, the generated types will auto-update. The component will use `as any` casts for the new columns until types regenerate, following the existing pattern in `HRModuleToggle.tsx`.

---

### File Summary

| Action | File |
|--------|------|
| Migration | Add `pf_applicable`, `salary_effective_from`, `gps_mode`, `camera_required` to `staff_hr_settings` |
| Create | `src/components/settings/StaffHRSettingsPanel.tsx` |
| Modify | `src/components/settings/StaffManagementPanel.tsx` (add HR Settings menu item + dialog) |

