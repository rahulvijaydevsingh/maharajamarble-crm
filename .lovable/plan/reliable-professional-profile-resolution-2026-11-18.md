# Reliable professional profile resolution

## What will change

- Create one shared professional-resolution helper that both task creation and task summaries use.
- Resolve in a safe, fixed order: an explicit lead profile link, then a primary lead-professional link, then only for professional-designated leads an exact normalized phone match.
- Replace the two capped 50-record professional scans with targeted phone lookups, so matching profiles are found regardless of database size.
- Preserve every existing lead/task relationship and keep non-professional leads fully isolated from phone matching.

## Validation

- Add focused tests for records beyond 50, formatted and alternate phones, empty/short phones, duplicates, and homeowner isolation.
- Run the complete Vitest suite and the TypeScript check after implementation.

## Technical details

- Only the shared resolver, the two existing callers, and focused resolver tests will change.
- No database, permission, audit-field, lockfile, or modal-layer changes are required.  
  
  
Approved! Please proceed with this plan, with the following 5 technical guardrails appended to the implementation and validation steps:
  ### Plan Addendum & Technical Guardrails
  1. **Phone Lookup Query & Normalization `src/lib/professionalResolver.ts`):**
     - For Priority 3 `isProfessionalDesignation(lead.designation) === true`), compute `phone10 = normalizePhone(lead.phone)` (last 10 digits)[cite: 3].
     - If `phone10.length !== 10`, short-circuit and return `null` immediately — NEVER execute an empty or partial `.ilike` query.
     - Query `public.professionals` using `.or(\`phone.ilike.%${phone10}%,alternate_phone.ilike.%${phone10}%`)` (and exclude inactive/archived professionals if `status` filtering applies) so numbers stored with `+91` or leading `0` are found server-side[cite: 3].
     - Pass the returned rows through exact 10-digit normalization `normalizePhone(p.phone) === phone10 || normalizePhone(p.alternate_phone) === phone10`) to eliminate substring false positives, and return `null` if more than 1 distinct professional matches (ambiguous duplicate protection)[cite: 3].
  2. **Strict Primary-Contact Guard on `lead_professionals` (Priority 2):**
     - When querying `public.lead_professionals` for `lead.id`, filter strictly by `.eq("lead_id", lead.id).eq("is_primary_contact", true)`. Never treat a non-primary site architect/contractor `is_primary_contact = false`) on a homeowner lead as the lead's primary professional profile[cite: 10].
  3. **Safe Task Creation Promotion `src/hooks/useTasks.ts`):**
     - In `addTask`, only run the lead-to-professional promotion when `task.lead_id` is present AND `(!task.related_entity_type || task.related_entity_type === "lead")`. Do not overwrite an explicit `related_entity_type === "customer"` or an already-populated `related_entity_type === "professional"`.
     - When a professional is resolved, set `related_entity_type = "professional"` and `related_entity_id = resolved.id` while preserving `lead_id` unchanged.
  4. **Fresh Cache Keys in `src/hooks/useLeadBrief.ts`:**
     - Ensure `lead.designation`, `lead.phone`, and `lead.professional_id` are included in the React Query `queryKey` inside `useLeadBrief.ts` so updating a lead's phone or designation immediately refreshes the task's People Strip without serving stale cached data[cite: 9].
  5. **Repo-Wide `.limit(50)` Check & Verification:**
     - Verify no other `.from("professionals").select(...).limit(50)` phone-matching scan remains in task components `TaskDetailView.tsx`, `EnhancedTaskTable.tsx`).
     - Run `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json` (confirming zero TypeScript errors in all touched files without modifying unrelated files).