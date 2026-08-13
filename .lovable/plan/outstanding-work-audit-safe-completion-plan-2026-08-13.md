# Outstanding Work Audit & Safe Completion Plan

## Audit results

- **Alerts:** Realtime invalidation refreshes both the notification count and list today. The list has no polling fallback, so it can remain stale after a silent Realtime disconnect while the count refreshes every 30 seconds.
- **Professional designation:** Task Detail renders the control-panel label for the task’s related professional in both existing rendering paths. The lead-linked path has no direct-fetch fallback when that professional is absent from the cached list. Tasks currently support one related professional, not a separate “other professionals” collection.
- **Retention controls:** `staff_hr_settings` already stores per-user `photo_retention_days` (default 90) and `location_retention_days` (default 30), with admin editing UI and existing HR RLS. There are no independent store-photo/store-location toggles, no separate retention table, no review list, and no purge process. Existing settings are not enforced.
- **Provider structure:** Calendar and all three pending-task providers are global despite route-local consumers. Professionals and Todo Lists have cross-route/global-header use and should remain global for now. The active `professionals-changes` error confirms the Professionals subscription also needs singleton-safe handling.

## 1. Stabilize Realtime providers before other changes

- Repair the active `professionals-changes` subscription collision using the same singleton/provider lifecycle pattern that resolved Tasks and Leads; ensure cleanup removes the exact channel and the effect does not subscribe before authentication is ready.
- Keep `ProfessionalsProvider` global because Tasks, Leads professional quick-add flows, the Professionals page, and the global header rely on it.
- Keep `TodoListsProvider` global because the header’s global quick-add reaches Todo functionality; avoid a risky layout-router refactor.
- Move `CalendarProvider` into the `/calendar` route tree only.
- Move each Pending Tasks provider into only its owning route:
  - Lead pending tasks → `/leads`
  - Customer pending tasks → `/customers`
  - Professional pending tasks → `/professionals`
- Leave Chat and Notifications global: the per-page header and its notification dropdown require their live data across protected routes.
- Add the missing `if (!user?.id) return;` guard to the announcements subscription effect in `useChat.ts`, matching the conversations effect.

## 2. Make alert-list refresh resilient

- Preserve current Realtime cache invalidation for notification count and list.
- Add a modest list-query polling fallback aligned with the unread-count cadence, so a disconnected Realtime channel cannot leave visible alerts stale indefinitely.
- Keep user-id/email compatibility filtering and existing mutation invalidations intact.
- Do not add another Realtime subscription or alter notification permissions.

## 3. Complete attendance data-retention controls

### Database and backup

- Create a CRM backup job before applying the migration, including HR & Attendance data and the private `attendance-photos` bucket manifest.
- Extend the existing per-staff HR settings rather than create a second settings table, adding independent `store_photos` and `store_location` booleans with safe defaults of `true`.
- Enforce a minimum of 30 days on both existing retention-day columns at the database level, after first normalizing any legacy values below 30 to prevent migration failure.
- Retain the established admin-write/self-or-admin-read RLS model for HR settings; no sensitive settings become publicly accessible.

### Capture and administration

- Update clock-in/out processing so disabled photo or location storage is respected at capture time: skip persisting the selected field while preserving the attendance row, time, and payroll calculations.
- Extend the existing Staff HR settings UI with independent photo/location storage switches and clear day controls; retain the existing per-user settings location.
- Add an admin review list for records eligible for cleanup, grouped by staff and data type, with explicit selection and confirmation. No automatic deletion or scheduled purge will run.

### Explicit purge workflow

- Add an admin-authorized cleanup action backed by a secure edge function.
- For approved photo cleanup: remove only referenced files from `attendance-photos`, then null only `clock_in_photo_url` / `clock_out_photo_url` that were successfully handled.
- For approved location cleanup: null only the four attendance latitude/longitude fields.
- Never delete or alter the `attendance_records` row, attendance status, worked hours, payroll values, or unrelated CRM attachments.
- Record an audit entry for each confirmed cleanup batch, including initiator, staff scope, data type, and affected count.

## 4. Harden professional designation display

- Consolidate the Task Detail professional lookup so both existing task paths use one resolver.
- If the cached professional is unavailable, safely fetch the minimal professional record by ID and continue rendering the designation label.
- Preserve the Control Panel label mapping with a raw-value fallback; do not introduce a second professional relationship model.

## Verification

- Run TypeScript diagnostics with zero errors.
- Use an authenticated session to visit dashboard, leads, customers, professionals, tasks, calendar, todo lists, messages, HR attendance, and settings; confirm zero console errors and no `postgres_changes ... after subscribe()` error.
- Verify Calendar and pending-task subscriptions are absent off their relevant routes and cleanly establish only when visiting those routes.
- Verify alerts list and count both update from an inserted/updated notification and the list has a polling recovery path.
- Verify an admin can save retention toggles/days, a value below 30 is rejected by the database, disabled capture does not persist the corresponding media/location, and a confirmed purge only clears selected attendance media/location while attendance history remains intact.
- Verify Task Detail shows a professional designation for both cached and fallback-loaded professional records.

## Technical notes

- No changes to `assigned_to`, `created_by`, or `updated_by` identity conventions.
- No automatic retention deletion, cron schedule, or general attachment cleanup is included.
- The routing changes are intentionally narrow to avoid reintroducing provider/channel collisions.
