

## Plan: Complete Leave Management Flow

### Overview
Build staff leave request submission, admin approval/rejection workflow, balance deduction, attendance marking, and delegation prompts. Two new pages, one edge function, and a DB migration for missing columns.

---

### PART 1 -- Database Migration

Add missing columns to `leave_requests`:

```sql
ALTER TABLE leave_requests
  ADD COLUMN admin_comment TEXT,
  ADD COLUMN half_day_type TEXT,
  ADD COLUMN document_url TEXT;
```

- `half_day_type`: 'morning' or 'afternoon' (null for full-day leaves)
- `document_url`: optional file path in crm-attachments bucket
- `admin_comment`: admin's comment on approve/reject

Also add a DELETE policy for staff to cancel their own pending requests:

```sql
CREATE POLICY "Staff can delete own pending leave requests"
ON leave_requests FOR DELETE TO authenticated
USING (auth.uid() = staff_id AND status = 'pending');
```

---

### PART 2 -- Edge Function: `hr-leave-request`

**File: `supabase/functions/hr-leave-request/index.ts`**

Handles leave request submission with server-side validation:

1. Verify JWT, extract staff_id
2. Validate inputs: leave_type, start_date, end_date, reason (min 10 chars), half_day_type
3. Calculate working days (exclude weekends using staff's work_days from staff_hr_settings)
4. Check leave_balances: if type is sick/casual/earned, verify remaining >= calculated days. LWP and half_day skip balance check.
5. Insert into leave_requests with status='pending'
6. Query tasks and reminders that fall within the leave date range for this staff
7. Create an in-app notification for all admin users: "Leave request from [staff_name] for [dates]"
8. Return: `{ success: true, request_id, working_days, affected_tasks_count }`

Config:
```toml
[functions.hr-leave-request]
verify_jwt = false
```

---

### PART 3 -- New Page: `src/pages/HRLeave.tsx` (Staff View)

**Route: `/hr/leave`**

Uses DashboardLayout. Three sections:

**A. Leave Balance Cards (top)**
- Fetch leave_balances for current user + current year
- Three cards: Sick, Casual, Earned
- Each shows: Used / Total with a Progress bar
- Color logic: green if remaining > 5, orange if 2-5, red if < 2

**B. "Request Leave" Button + Modal**
- Leave Type selector: Sick / Casual / Earned / Half Day / LWP
- Start Date + End Date pickers (or Morning/Afternoon selector for Half Day)
- Auto-calculated working days shown below dates
- Balance warning if insufficient
- Reason textarea (required, min 10 chars)
- Document upload (optional, uses crm-attachments bucket)
- Submit calls the hr-leave-request edge function
- On success: refresh data, show toast

**C. My Leave History Table**
- Fetch all leave_requests for current user, ordered by created_at desc
- Columns: Date Range | Type | Days | Status | Admin Comment
- Status badges: yellow=pending, green=approved, red=rejected
- "Cancel" button on pending rows: deletes the leave_request row

---

### PART 4 -- New Page: `src/pages/HRLeaveApprovals.tsx` (Admin Only)

**Route: `/hr/leave-approvals`**

Uses DashboardLayout. Two sections:

**A. Pending Approvals**
- Fetch leave_requests where status='pending', join with profiles for staff name
- For each pending request, show a card with:
  - Staff name + leave dates + type + days + reason
  - Balance before/after calculation
  - Warning banner if staff has open tasks during the leave period (query tasks table)
  - "Approve" (green) and "Reject" (red) buttons
  - Both open a comment dialog (required for reject, optional for approve)

**On Approve:**
1. Update leave_requests: status='approved', approved_by, approved_at, admin_comment
2. Deduct from leave_balances: used += total_days, remaining -= total_days
3. Insert attendance_records with status='on_leave' for each date in range
4. Check for open tasks/reminders during period; if any exist, show a delegation prompt dialog ("This affects N tasks. Delegate now or later?")
   - "Delegate Now" placeholder (links to staff's task list filtered by date range -- full delegation UI is Part 5 of the HR module)
   - "Later" dismisses
5. Create notification for staff: "Your leave request was approved"

**On Reject:**
1. Update leave_requests: status='rejected', approved_by, approved_at, admin_comment (with rejection reason)
2. Notify staff: "Your leave request was rejected: [reason]"

**B. Leave History Table**
- All reviewed requests with filters: staff name, month, leave type, status
- Columns: Staff | Dates | Type | Days | Status | Admin Comment

---

### PART 5 -- Route and Navigation Integration

**Modify: `src/App.tsx`**
- Import HRLeave and HRLeaveApprovals pages
- Add routes:
  - `/hr/leave` -- ProtectedRoute (any authenticated user)
  - `/hr/leave-approvals` -- ProtectedRoute with requiredRole="admin"

**Modify: `src/components/shared/Sidebar.tsx`**
- Update the HR nav section: instead of a single "HR" link, add sub-items when HR is enabled:
  - "Attendance" -> `/hr/attendance`
  - "My Leave" -> `/hr/leave`
  - "Leave Approvals" -> `/hr/leave-approvals` (admin only)

  Implementation: keep the single "HR" item but change path to `/hr/attendance`. Add two more items below it conditionally. Alternatively, make the HR section a collapsible group with sub-items.

---

### PART 6 -- Supabase Types Update

The types file will auto-update after migration. Use `as any` casts for the new columns (`admin_comment`, `half_day_type`, `document_url`) until types regenerate.

---

### File Summary

| Action | File |
|--------|------|
| Migration | Add `admin_comment`, `half_day_type`, `document_url` to `leave_requests` + delete policy |
| Create | `supabase/functions/hr-leave-request/index.ts` |
| Create | `src/pages/HRLeave.tsx` |
| Create | `src/pages/HRLeaveApprovals.tsx` |
| Modify | `src/App.tsx` (add 2 new routes) |
| Modify | `src/components/shared/Sidebar.tsx` (add HR sub-navigation) |
| Modify | `supabase/config.toml` (add hr-leave-request verify_jwt=false) |

### Implementation Order
1. Database migration (add columns + policy)
2. Edge function (hr-leave-request)
3. HRLeave.tsx (staff view)
4. HRLeaveApprovals.tsx (admin view)
5. App.tsx routes + Sidebar navigation

