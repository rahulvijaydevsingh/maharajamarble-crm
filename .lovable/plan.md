

## Analysis: Document vs Current System State

The document contains two prompts. Here is what needs fixing/implementing:

### Prompt 1: Task "Assigned To" Filter Deduplication
**Status: Partially done.** The Tasks page filter was already fixed in a previous message using `useActiveStaff` for profile-based resolution. However, the **same duplicate issue exists on the Leads page** -- `EnhancedLeadTable.tsx` line 308-309 builds `uniqueAssignedTo` directly from raw `lead.assigned_to` values (which mix names and emails). The Customers and Professionals tables also have assignee inline filters that likely pull raw values.

**Fix needed:**
- `src/components/leads/EnhancedLeadTable.tsx` -- Replace raw `uniqueAssignedTo` with the same `useActiveStaff` + `StaffMultiSelectFilter` pattern used in the Tasks fix
- `src/components/customers/EnhancedCustomerTable.tsx` -- Same fix for its assignee filter
- `src/components/professionals/EnhancedProfessionalTable.tsx` -- Same fix for its assignee filter

### Prompt 2: Professional Duplicate Check, Auto-Add & Admin Notification
**Status: Not implemented at all.** This is a substantial new feature with four parts:

**Part A -- Edge Function `check-professional`**
- New edge function that accepts `{ phone, name, lead_id, staff_id }`
- Checks `professionals` table by phone number
- If match found: returns `{ status: 'existing', professional: {...} }`
- If no match: inserts new professional (with `verified: false`), creates admin notification + verification task, logs to staff activity, returns `{ status: 'new_added', professional: {...} }`

**Part B -- Frontend: Inline Professional Check in Lead Form**
- In `SourceRelationshipSection.tsx` (used by both AddLeadDialog and LeadDetailView edit mode), add a trigger on blur of the professional phone field
- Shows inline banner based on edge function result:
  - "Professional found: [Name]. Was this lead referred by them? [Yes] [No]"
  - "New professional added. Admin notified. Was this lead referred by them? [Yes] [No]"
  - Error state (non-blocking)
- Yes sets `referred_by` field; No just links without setting referral

**Part C -- Automation Rule: Unverified Professional Reminder**
- Scheduled weekly check for `verified = false AND created_at > 3 days ago`
- This is a manual configuration step in the automation UI, not code -- but the infrastructure (verified column) must exist first

**Part D -- Database Migration**
- Add columns to `professionals` table: `verified` (boolean, default false), `verified_at` (timestamptz), `verified_by` (uuid ref profiles), `added_by` (uuid ref profiles), `added_via_lead_id` (uuid ref leads, ON DELETE SET NULL)
- Add "Verified" / "Pending Verification" badge to professional detail view and list
- Add "Mark as Verified" button for admins
- Add "Unverified only" filter option in professionals list

---

### Implementation Plan

| # | Task | Files |
|---|------|-------|
| 1 | Fix assignee filter deduplication on Leads, Customers, Professionals pages | `EnhancedLeadTable.tsx`, `EnhancedCustomerTable.tsx`, `EnhancedProfessionalTable.tsx` |
| 2 | DB migration: add verified/added_by/added_via_lead_id columns to professionals | SQL migration |
| 3 | Create `check-professional` edge function | `supabase/functions/check-professional/index.ts` |
| 4 | Add inline professional check UI in lead form | `src/components/leads/smart-form/SourceRelationshipSection.tsx` |
| 5 | Add Verified badge + Mark as Verified button + Unverified filter | `ProfessionalDetailView.tsx`, `EnhancedProfessionalTable.tsx` |

### Scope Note
Part C (the scheduled automation rule) is a configuration action done via the existing Automation Rules UI, not a code change. The database columns from Part D enable it.

