
Goal: fix three regressions together in one pass:
1) dropdowns not visible in task/reminder forms (layering),
2) reliable staff login activity logging for workflow automation,
3) first-login-of-day clock-in prompt for attendance.

Current findings from code review:
- The affected dropdowns are in:
  - src/components/tasks/AddTaskDialog.tsx (Reminder select has no elevated z-index; Recurrence section reused)
  - src/components/tasks/form/RecurrenceSection.tsx (frequency/end select uses z-[80], below AddTask dialog z-[100])
  - src/components/leads/detail-tabs/AddReminderDialog.tsx (Assigned To + recurrence selects have default z-50)
- Shared primitives currently use low defaults:
  - src/components/ui/select.tsx uses z-50
  - src/components/ui/popover.tsx uses z-50
- This conflicts with nested/sibling dialogs that intentionally render at z-[80]/z-[100], so menu content is rendered behind overlays.
- Login logging exists in AuthContext signIn() and edge function log-login, but it’s tied to explicit sign-in; daily “first app open” behavior is not guaranteed for persisted sessions.
- Automation trigger from staff_activity_log is present in backend triggers, so login entries can drive automations once logging is reliable.

Implementation approach

A) Permanent layering fix (systemic + targeted)
1. Raise base layering in shared primitives
- Update src/components/ui/select.tsx:
  - change SelectContent base class from z-50 to a higher consistent layer (e.g., z-[220]).
- Update src/components/ui/popover.tsx:
  - change PopoverContent base class from z-50 to z-[220].
Reason: avoids repeating one-off z-index bugs in every form/dialog.

2. Patch known affected forms explicitly (defensive)
- src/components/tasks/AddTaskDialog.tsx:
  - add className="z-[220]" to the Reminder SelectContent (currently missing).
- src/components/tasks/form/RecurrenceSection.tsx:
  - change SelectContent/PopoverContent classes from z-[80] to z-[220].
- src/components/leads/detail-tabs/AddReminderDialog.tsx:
  - add z-[220] to:
    - Assigned To SelectContent
    - Frequency SelectContent
    - Ends SelectContent
    - date popovers used inside recurrence/date pickers if needed
This guarantees visibility in parent detail dialogs using custom z-indices.

3. Keep existing dialog sibling strategy intact
- Do not alter the existing hideOverlay/sibling-dialog architecture; only menu/popup layers are corrected above dialog stacks.

B) Staff login activity logging reliability (for automations)
1. Strengthen backend login endpoint behavior
- Update supabase/functions/log-login/index.ts to return richer response:
  - first_login_today: boolean
  - should_prompt_clock_in: boolean
- Function logic:
  - authenticate caller via bearer token (already done),
  - determine whether this is first login event for user on current date,
  - insert login record in staff_activity_log (still independent of attendance),
  - evaluate attendance for today:
    - if no usable attendance record (and not already marked on_leave), set should_prompt_clock_in = true for first login.
Notes:
- No schema changes needed.
- Existing created_at index and activity log structure are sufficient.

2. Remove race in client-side login logging
- In src/contexts/AuthContext.tsx:
  - introduce a helper (e.g., logLoginEventForSession(session, mode)),
  - call with explicit Authorization token instead of relying on immediate session propagation,
  - keep logging behavior independent of clock-in status.

3. Ensure daily logging when session is restored
- In AuthContext bootstrap flow (existing session from getSession/onAuthStateChange), run one daily check/log path so first app open of day is captured even if user stayed signed in.
- Add a per-user/day client guard (sessionStorage key) to prevent repeated calls during same browser session refresh cycle.

C) First-login-of-day clock-in prompt UX
1. Add a global prompt component
- Add a small reusable component (e.g., src/components/hr/FirstLoginClockInPrompt.tsx) rendered in DashboardLayout (or Header).
- It reads a one-time flag set by AuthContext after log-login response.
- Dialog text:
  - “This is your first login today. Please clock in for attendance.”
- Actions:
  - “Clock In Now” → navigate("/hr/attendance")
  - “Later” → dismiss once for current session/date.

2. Prompt display rules
- Show only when:
  - backend said first_login_today + should_prompt_clock_in,
  - HR module is enabled,
  - role is not sales_viewer (and optionally only for users having staff_hr_settings row).
This prevents prompting non-HR users/admins without attendance setup.

D) Validation and regression testing (end-to-end)
1. Dropdown visibility checks
- Open Add Task dialog:
  - Reminder dropdown visible and selectable,
  - Recurrence frequency/end dropdown visible and selectable.
- Open Add Reminder dialog from:
  - Lead detail,
  - Customer detail,
  - Professional detail.
Verify Assigned To + recurrence frequency/end dropdowns appear above overlays.

2. Login/activity checks
- Sign out/in with a staff user:
  - new login row appears in Staff Activity panel.
- Confirm automation compatibility:
  - staff_activity_log insert still emits automation trigger path.

3. First-login prompt checks
- First login of date:
  - prompt appears once and routes to attendance on confirmation.
- Same-day re-login/refresh:
  - no repeated nagging loop.
- If already clocked in or on approved leave:
  - no prompt shown.

4. Accessibility sanity
- Ensure new prompt dialog includes title + description (avoids current Radix warning pattern).

Files to modify
- src/components/ui/select.tsx
- src/components/ui/popover.tsx
- src/components/tasks/AddTaskDialog.tsx
- src/components/tasks/form/RecurrenceSection.tsx
- src/components/leads/detail-tabs/AddReminderDialog.tsx
- src/contexts/AuthContext.tsx
- supabase/functions/log-login/index.ts
- src/components/layout/DashboardLayout.tsx
- (new) src/components/hr/FirstLoginClockInPrompt.tsx

Sequencing
1) Layering primitives + affected forms,
2) log-login backend response enhancement,
3) AuthContext daily logging + one-time prompt flag,
4) global prompt component wiring,
5) end-to-end verification pass focused on the exact broken flows.
