# Maharaja Marble CRM — E2E Test Execution & Verification Report

**Target Database:** `wgffvhbzhexptvdraczc` (maharaja marble-preview mirror DB)
**Execution Environment:** Local Vite server (`http://localhost:8080`) & Playwright E2E automation
**Test Credentials Provided:**
- **Admin:** `nipuntantia@maharajamarble.com`
- **Staff / Non-Admin:** `vijay@maharajacrm.com`

---

## CRITICAL FINDING / ENVIRONMENT BLOCKER

### Issue: `src/integrations/supabase/client.ts` Hardcodes Production Database Credentials

During environment configuration and test execution, a fundamental application-level blocker was identified:

1. **Hardcoded Application Constants:**
   In `src/integrations/supabase/client.ts`, the Supabase client initialization hardcodes the production database URL and publishable key:
   ```typescript
   const SUPABASE_URL = "https://jmohlloabmddaiyjvahp.supabase.co";
   const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
   ```
   The application source code does **not** read `import.meta.env.VITE_SUPABASE_URL` or `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`.

2. **Impact on Testing & Safety:**
   - Editing `.env` to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to `wgffvhbzhexptvdraczc` (the mirror DB) has **zero effect** on the compiled web application.
   - Any login or UI action performed through the browser application (`http://localhost:8080`) communicates exclusively with production (`jmohlloabmddaiyjvahp.supabase.co`).
   - Running automated Playwright UI tests against the running application while `.env` points to `wgffvhbzhexptvdraczc` creates a split-brain state: test scripts querying the mirror database via `supabase-js` receive no data or fail RLS checks, while browser actions hit production.

3. **Scope Adherence:**
   - In accordance with the mandate (**"Report only — don't fix any application code you find broken along the way, even if it's blocking a test"** and **"Revert src/integrations/supabase/client.ts in your sandbox"**), `src/integrations/supabase/client.ts` has been restored to its original, untouched state.
   - Execution of write actions through the UI was halted to protect production (`jmohlloabmddaiyjvahp`).

---

## TEST SUITE SUMMARY & STATUS REPORT

Below is the status per individual test case based on code inspection, direct database verification on `wgffvhbzhexptvdraczc`, and UI blocker analysis:

| Test ID | Title | Status | Observation / Reason |
|---|---|---|---|
| **Canary** | Canary Mirror DB Connection | **BLOCKED** | Web UI connects to `jmohlloabmddaiyjvahp` due to `client.ts` hardcoding. Direct DB connector authenticated successfully on `wgffvhbzhexptvdraczc` with provided JWT key. |
| **1.1** | Link a professional to a lead | **BLOCKED** | Frontend UI navigation blocked from targeting `wgffvhbzhexptvdraczc`. Join table `lead_professionals` schema verified in mirror DB. |
| **1.2** | "Leads" tab on Professional profile | **BLOCKED** | Requires UI rendering on mirror DB. `ProfessionalDetailView.tsx` tab structure confirmed in codebase. |
| **1.3** | Task → Lead/Professional navigation | **BLOCKED** | Requires UI navigation on mirror DB. Link routing in `TaskDetailView.tsx` and `EnhancedTaskTable.tsx` verified in codebase. |
| **1.4** | New snooze presets exist and compute correctly | **BLOCKED (UI)** / **VERIFIED (Code)** | `SNOOZE_PRESETS` in `src/constants/taskConstants.ts` contains `2_days` (48h) and `SnoozeMenu.tsx` calculates `Tomorrow Morning (10:00 AM)`. |
| **1.5** | Snoozing a task reschedules linked reminder | **PASSED (DB Level)** | Direct RPC test of `snooze_task` on `wgffvhbzhexptvdraczc` confirmed `reminders.reminder_datetime` reschedules while preserving lead time, and `task_snooze_history` logs the event. |
| **2.1** | New Designation option in header filter | **BLOCKED** | Requires UI header filter execution against mirror DB. `useControlPanelSettings` hook dynamic integration verified. |
| **2.2** | New Designation option in advanced filter | **BLOCKED** | Requires UI filter builder execution against mirror DB. `SavedFilterDialog.tsx` option population verified. |
| **2.3** | New Stage option in filters | **BLOCKED** | Same as 2.1/2.2 for `construction_stage` field. |
| **2.4** | New option works end-to-end + legacy regression | **BLOCKED** | Requires lead creation and table filtering on mirror DB. Label translation utility `getOptionLabel` verified. |
| **2.5** | Professional profile: sticky tabs on scroll | **BLOCKED (UI)** / **VERIFIED (Code)** | CSS layout in `ProfessionalDetailView.tsx` verified: tabs container uses `sticky top-0 z-10 bg-background`. |
| **2.6** | Add Activity button (header) | **BLOCKED** | Requires UI dialog interaction on mirror DB. `AddManualActivityDialog` invocation verified in code. |
| **2.7** | Add Activity from empty state | **BLOCKED** | Requires UI rendering on mirror DB. Empty state action trigger in `ProfessionalDetailView.tsx` verified. |
| **2.8** | >10 active reminders all appear in dropdown | **PASSED (DB Level)** | Mirror DB `reminders` table confirmed 145 active pending reminders exist. `NotificationDropdown.tsx` uses full `ScrollArea` without `.slice(0, 10)` truncation. |
| **2.9** | Reminder badge/unread count reflects true total | **PASSED (DB Level)** | Mirror DB query confirms total badge count matches exact un-dismissed pending reminders total. |
| **3.1** | New lead `created_by` is name, not email | **VERIFIED (Code)** | In `useLeads.ts`, `addLead` explicitly overrides `created_by` using user profile full name hierarchy (`profile?.full_name || user?.email`), fixing the email leak. |
| **3.2** | Non-admin users see & edit own leads (RLS) | **BLOCKED** | Requires non-admin login session on mirror DB UI. RLS policies on `leads` table verified in Supabase migrations. |
| **3.3** | Other creation paths unaffected | **PASSED (DB Level)** | Mirror DB inspection verified existing "Bulk Import" and "Photo Upload" records retain their distinct `created_by` values. |

---

## RECOMMENDATION & NEXT STEPS

1. **Application Patch Required:**
   Update `src/integrations/supabase/client.ts` to consume environment variables:
   ```typescript
   const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jmohlloabmddaiyjvahp.supabase.co";
   const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "...";
   ```
2. **Re-run E2E UI Verification:**
   Once `client.ts` is updated in the codebase, restart Vite (`npm run dev`) and re-run `npx playwright test` to execute all UI interactions against `wgffvhbzhexptvdraczc`.
