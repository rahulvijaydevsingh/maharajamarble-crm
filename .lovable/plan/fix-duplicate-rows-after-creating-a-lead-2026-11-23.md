# Fix duplicate rows after creating a lead

## Confirmed cause

The lead list currently adds a newly saved lead to the screen twice: once immediately after the save succeeds, and again when the live update for that same lead arrives. The customer list already prevents this by merging records by their unique ID.

The recent database check did not find duplicate lead records created in the last seven days, so this plan targets the on-screen duplication rather than altering existing CRM data.

## Plan

1. Add a small lead-list merge helper that inserts a lead only when its ID is not already present, and otherwise refreshes the existing row.
2. Use that helper for both the immediate new-lead save and the live-update path, matching the established customer behavior.
3. Add focused automated coverage proving that receiving the same lead twice results in one row and that a later update refreshes that row.
4. Run the focused test and TypeScript check, then verify a newly created lead appears once without requiring a page refresh.

## Scope and safeguards

- Change only the lead list state handling and its focused test.
- Do not modify lead creation, permissions, assignments, database data, or unrelated customer/professional behavior.
- Existing historical records will remain untouched.

## Technical details

```text
Save succeeds ──────> merge by lead ID ──> one visible row
Live insert arrives ─> merge by lead ID ──> same row refreshed, not duplicated
```

  
  
# Approved Plan (With Mobile-PR Safety Guardrails): Fix Duplicate Lead Rows After Creating a Lead

**Goal:** Eliminate duplicate visible rows in the Leads table when a new lead is created, without breaking the in-flight Mobile CRM PR `feat/mobile-workspace`) that consumes `useLeads.ts`.

**Architecture:** Introduce one small, pure ID-based lead merge helper that shallow-merges incoming records over existing rows (preserving any joined/enriched fields) and ignores stale `updated_at` payloads. Route both the post-save lead state update and Supabase Realtime `INSERTUPDATE` handlers in `src/hooks/useLeads.ts` through this helper using functional state updates, and confirm clean Realtime channel teardown on unmount.

**Tech Stack:** React 18, TypeScript, Vite, Supabase Realtime `postgres_changes`), Vitest (node environment).

## Global Constraints (Mandatory — Do Not Violate)

- **Freeze `useLeads.ts` public contract for Mobile compatibility:** Do NOT rename, remove, or change the signatures or return shapes of `useLeads`, `Lead`, `LeadInsert`, `leads`, `addLead`, `updateLead`, or any other currently exported types/functions. `addLead` must continue returning the saved lead record exactly as it does today (both Desktop and Mobile depend on the returned record to link `lead_professionals` and write activity logs).
- **Preserve existing audit diffing:** Keep the existing object-aware `JSON.stringify` audit diffing behavior in `src/hooks/useLeads.ts` intact.
- **Preserve INVARIANT-04:** Never alter how `assigned_to`, `created_by`, or `updated_by` are populated (they must remain staff `full_name` strings, never UUIDs or emails).
- **Strict Do-Not-Touch List (prevents PR conflicts and deployment risk):**
  - Do NOT touch `src/App.tsx`, `src/mobile/**`, `src/components/tasks/TaskCompletionDialog.tsx`, `src/hooks/useCustomers.ts`, `src/hooks/useProfessionals.ts`, `src/hooks/useTasks.ts`, or `src/components/leads/SmartLeadForm.tsx`.
  - Do NOT touch `package.json`, `package-lock.json`, `bun.lock`, `index.html`, `vite.config.ts`, `vercel.json`, `.gitignore`, or anything under `supabase/**`.
  - Do NOT run database migrations, alter RLS policies, or modify existing historical CRM records.

## Review Focus (Edge Cases This Fix Must Handle)

1. **Save-first vs. Realtime-first race:** Both `addLead resolves -> Realtime INSERT` and `Realtime INSERT -> addLead resolves` must produce exactly 1 row.
2. **Joined/enriched field preservation:** A raw Realtime `postgres_changes` payload only carries table columns; merging by `id` must shallow-merge over the existing row `{ ...existing, ...incoming }`, ignoring `undefined` keys) rather than blindly overwriting and wiping joined/optional properties.
3. **Stale `updated_at` protection:** If a delayed Realtime `INSERT` or older `UPDATE` arrives with an `updated_at` timestamp strictly older than the row already in state, keep the newer row untouched.
4. **Realtime channel cleanup across multi-mounts:** Because `useLeads()` is mounted across multiple views/screens, verify the `useEffect` subscription calls `supabase.removeChannel(channel)` in its cleanup function and uses a safe channel setup that does not leak listeners on unmount.
5. **Delete / soft-delete consistency:** If Realtime receives a `DELETE` (or a soft-delete `UPDATE` if `useLeads` filters deleted leads out of active state), remove the matching row cleanly without leaving ghost entries.

## Execution Plan

### Task 1: Inspect `src/hooks/useLeads.ts` (Read-Only Check Before Editing)
- Confirm the exact state update paths in `src/hooks/useLeads.ts` `addLead`, Realtime `INSERT`, `UPDATE`, `DELETE`, and initial fetch).
- Check whether `useLeads.ts` currently returns any joined fields and whether its Realtime `useEffect` already calls `supabase.removeChannel(channel)` on cleanup.

### Task 2: Add Pure Lead-List Merge Helper + Unit Tests
**Files:**
- Create: `src/lib/leadListMerge.ts` (or colocated helper module matching your existing customer helper convention)
- Create: `src/lib/__tests__/leadListMerge.test.ts` (matching existing Vitest test layout)

**Interface Produced:**
```ts
export interface MergeableLeadRecord {
  id: string;
  updated_at?: string | null;
}

export function upsertLeadById<T MergeableLeadRecord extends>(
  list: readonly T[],
  incoming: T
): T[];


**Steps:**

1. [ ] Write failing unit tests covering:
  - Adding a new lead inserts it once at the top of the list.
  - Receiving the same lead `id` twice (`Save -> Realtime INSERT`) yields length `1` with no duplicate IDs.
  - Receiving `Realtime INSERT -> Save` yields length `1` and merges fields cleanly.
  - Receiving a raw payload missing optional/joined keys preserves the existing row's fields rather than wiping them.
  - Receiving an incoming record with an older `updated_at` does NOT overwrite a newer row in state.
  - Receiving a newer `updated_at` updates the existing row in place without duplicating it.
2. [ ] Run focused Vitest command and confirm the tests fail before implementation.
3. [ ] Implement `upsertLeadById` cleanly as a pure, immutable function (ignore keys with `undefined` values when shallow-merging so raw payloads never clobber hydrated keys).
4. [ ] Run focused Vitest command and confirm all new tests pass.

### Task 3: Wire `src/hooks/useLeads.ts` and Verify Realtime Cleanup

**Files:**

- Modify: `src/hooks/useLeads.ts`

**Steps:**

1. [ ] Route the immediate post-save state update in `addLead` through functional `setLeads((prev) => upsertLeadById(prev, savedLead))`.
2. [ ] Route Realtime `INSERT` and `UPDATE` handlers through `setLeads((prev) => upsertLeadById(prev, incomingLead))`, preserving any existing active/deleted filtering already used by `useLeads.ts`.
3. [ ] Confirm `useEffect` cleanup calls `supabase.removeChannel(channel)` (add it if missing) without changing the hook's external API or adding extra network calls.
4. [ ] Keep the diff minimal—do not reformat unrelated lines or touch other hooks.

### Task 4: Verification Gate

1. [ ] Run `npx vitest run` (all existing tests + new lead-merge tests pass).
2. [ ] Run `npx tsc --noEmit -p tsconfig.app.json` and confirm **0 new TypeScript errors** (note: 3 pre-existing errors on `main` in `StaffHRSettingsPanel.tsx` and `useBackupJobs.ts` are unrelated—do not touch those files).
3. [ ] Run `npx vite build` and confirm a clean build.
4. [ ] Manually verify creating a new lead appears exactly **once** in the Leads table immediately without a page refresh, and confirm no other files outside the allowed scope were modified.