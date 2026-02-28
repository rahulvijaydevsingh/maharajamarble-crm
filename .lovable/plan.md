

## Plan: HR Attendance Clock-In/Out Feature

### Overview
Build the attendance page with camera-based clock-in/out, GPS verification, edge functions for secure server-side timestamping, and a private storage bucket for attendance photos. This is the security-critical core of the HR module.

---

### PART 1 -- Database Migration

**Add columns to `attendance_records`:**
```sql
ALTER TABLE attendance_records
  ADD COLUMN clock_in_photo_url TEXT,
  ADD COLUMN clock_out_photo_url TEXT,
  ADD COLUMN clock_in_flag TEXT,
  ADD COLUMN clock_out_flag TEXT,
  ADD COLUMN clock_in_verified BOOLEAN DEFAULT false,
  ADD COLUMN clock_out_verified BOOLEAN DEFAULT false;
```

**Create private storage bucket:**
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', false);
```

**Storage RLS policies** (on `storage.objects`):
- INSERT: authenticated users can upload to their own `{user_id}/` path
- SELECT: own files OR admin
- DELETE: admin only

**Allow staff to INSERT their own attendance** (currently only admin can insert):
```sql
CREATE POLICY "Staff can insert own attendance"
ON attendance_records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = staff_id);
```

Also add UPDATE policy for staff to update their own record (for clock-out):
```sql
CREATE POLICY "Staff can update own attendance"
ON attendance_records FOR UPDATE TO authenticated
USING (auth.uid() = staff_id);
```

---

### PART 2 -- Edge Function: `hr-clock-in`

**File: `supabase/functions/hr-clock-in/index.ts`**

**Config addition to `supabase/config.toml`:**
```toml
[functions.hr-clock-in]
verify_jwt = false
```

**Logic:**
1. Handle CORS preflight
2. Verify JWT via `getUser()` -- extract `user.id` as `staff_id`
3. Parse FormData: extract `photo` (Blob), `latitude`, `longitude`
4. Check for existing clock-in today (`attendance_records` where `staff_id` and `date = CURRENT_DATE`) -- if exists, return 409 error
5. Fetch `staff_hr_settings` for this staff using admin client
6. GPS verification: if `gps_mode = 'strict'`, calculate Haversine distance from office coords. If distance > `gps_radius_meters`, set `clock_in_flag = 'outside_radius'`, `clock_in_verified = false`. Otherwise `clock_in_verified = true`. If mode is `flexible` or `exempt`, set verified = true with no flag.
7. Upload photo to `attendance-photos` bucket at path `{staff_id}/{YYYY-MM-DD}/clock-in.jpg` using admin client
8. Get signed URL for the photo (short-lived, for display)
9. Insert `attendance_records` row using admin client with `clock_in = NOW()`, `date = CURRENT_DATE`, GPS coords, photo URL, flag, verified status
10. Return `{ success: true, time: <server NOW()>, verified, flagged, flag_reason }`

---

### PART 3 -- Edge Function: `hr-clock-out`

**File: `supabase/functions/hr-clock-out/index.ts`**

**Config addition:**
```toml
[functions.hr-clock-out]
verify_jwt = false
```

**Logic:**
1. Same CORS + JWT verification
2. Parse FormData: photo, latitude, longitude
3. Find today's attendance record for this staff -- if none or already clocked out, return error
4. GPS verification (same as clock-in)
5. Upload photo to `{staff_id}/{YYYY-MM-DD}/clock-out.jpg`
6. Calculate `total_hours` = `NOW() - clock_in` (in decimal hours)
7. Fetch `staff_hr_settings` to get shift duration. Calculate `overtime_hours` if total > scheduled shift length
8. Determine attendance `status`: if clock_in was late (after shift_start + buffer), set status accordingly
9. UPDATE the existing attendance record: set `clock_out = NOW()`, clock-out GPS, photo, flag, verified, total_hours, overtime_hours, status
10. Return `{ success: true, time, total_hours, overtime_hours, verified, flagged }`

---

### PART 4 -- Attendance Page

**File: `src/pages/HRAttendance.tsx`**

Uses `DashboardLayout`. Fetches today's attendance record for the current user on mount.

**Top Section -- Today's Status Card:**
Three states based on the attendance record:
- **Not clocked in**: Grey card with "Not Clocked In Today" heading + large green "Clock In" button
- **Clocked in (no clock_out)**: Green card showing clock-in time, live duration counter (updates every second via `setInterval`), small blurred clock-in photo thumbnail, GPS verified badge (green checkmark or orange warning if flagged), large orange "Clock Out" button
- **Clocked out**: Blue card showing "Today Complete -- Xh Ym worked", both times, hours summary

**Bottom Section -- Attendance History:**
Fetches last 14 days from `attendance_records` for this user. Renders a table with columns: Date, Status, Clock In, Clock Out, Hours, Flag. Color-coded badges: green=present, red=absent, yellow=leave, grey=weekend/holiday.

---

### PART 5 -- Clock-In/Out Modal Component

**File: `src/components/hr/ClockInOutModal.tsx`**

A two-step modal (uses Dialog):

**Step 1 -- Permissions:**
- On open, simultaneously request GPS (`navigator.geolocation.getCurrentPosition`) and Camera (`navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })`)
- Show two status indicators with emoji icons:
  - GPS Location: "Requesting..." then "Acquired" (green) or "Denied" (red)
  - Camera: "Requesting..." then "Ready" (green) or "Denied" (red)
- If denied: show clear message + "How to enable" help text
- "Continue" button disabled until both succeed
- Store the GPS position and MediaStream in refs

**Step 2 -- Live Camera Capture:**
- Render `<video>` element with the acquired MediaStream, `autoPlay`, `playsInline`, mirror CSS
- Circular/rectangular viewfinder overlay (CSS border-radius)
- Small text: "Location acquired" with pin icon
- Large "Capture & Clock In" (or "Capture & Clock Out") button
- NO file input, NO gallery option anywhere

**On capture:**
1. Draw current video frame to an offscreen `<canvas>` (matching video dimensions)
2. `canvas.toBlob(callback, 'image/jpeg', 0.8)` to get JPEG blob
3. Stop all media tracks
4. Build `FormData` with: `photo` (blob), `latitude`, `longitude`
5. Call `supabase.functions.invoke('hr-clock-in' or 'hr-clock-out', { body: formData })` -- note: for FormData, use raw fetch with auth header instead of SDK invoke (SDK auto-sets content-type to JSON)
6. Show loading spinner, disable button
7. On success: close modal, refresh status card, show success toast
8. On error: show inline error message, keep modal open, allow retry

---

### PART 6 -- Route + App Integration

**Modify: `src/App.tsx`**
- Import `HRAttendance` page
- Add route: `<Route path="/hr/attendance" element={<ProtectedRoute><HRAttendance /></ProtectedRoute>} />`
- Also add a parent `/hr` route that redirects to `/hr/attendance` (this is where the sidebar link points)

**Modify: `src/components/shared/Sidebar.tsx`**
- Update the HR nav item path from `/hr` to `/hr/attendance` (or keep `/hr` and add redirect)

---

### File Summary

| Action | File |
|--------|------|
| Migration | Add photo/flag/verified columns to `attendance_records` |
| Migration | Create `attendance-photos` storage bucket + RLS |
| Migration | Add staff self-insert/update RLS policies for `attendance_records` |
| Create | `supabase/functions/hr-clock-in/index.ts` |
| Create | `supabase/functions/hr-clock-out/index.ts` |
| Modify | `supabase/config.toml` (add verify_jwt=false for both functions) |
| Create | `src/pages/HRAttendance.tsx` |
| Create | `src/components/hr/ClockInOutModal.tsx` |
| Modify | `src/App.tsx` (add HR routes) |
| Modify | `src/components/shared/Sidebar.tsx` (update HR path) |

---

### Regarding the 19-page HR Module Document

Yes, I understand the full scope. The complete HR module covers these major parts:

1. **Foundation** (done) -- system_settings toggle, 7 HR tables, HRModuleContext, sidebar conditional nav
2. **Staff HR Config** (done) -- per-staff salary/schedule/GPS/leave settings in Staff Management panel
3. **Attendance Clock-In/Out** (this plan) -- camera + GPS capture, edge functions, attendance page
4. **Leave Management** -- leave request submission, admin approval workflow, balance deductions, calendar integration
5. **Work Delegation** -- delegate tasks when on leave, audit trail
6. **Salary/Payroll** -- monthly salary generation from attendance data, deductions, overtime, export
7. **Public Holidays** -- holiday calendar management, impact on attendance calculations
8. **HR Dashboard** -- summary widgets, attendance trends, leave overview, payroll status
9. **Admin Attendance Management** -- manual entry/corrections, bulk marking, reports

Each part builds on the previous. Parts 4-9 will be implemented in subsequent iterations.

