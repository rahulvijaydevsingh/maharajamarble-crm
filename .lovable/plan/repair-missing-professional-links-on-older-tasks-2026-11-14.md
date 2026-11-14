# Repair missing professional links on older tasks

## Verified finding

- Amit’s Builder profile exists and is linked to his lead through the same normalized phone number.
- His affected follow-up task is stored as a lead task (`related_entity_type = lead` and `related_entity_id = lead_id`), so the task screen has no professional profile reference to show.
- The task screen only renders the professional link when the task itself is marked as related to a professional. New task creation already supports this model.
- A cautious scan identified 35 historical tasks where the lead has a professional designation and exactly one matching professional profile by normalized phone number. Amit’s task is in this group. No ambiguous match is included in that count.

## Plan

1. Correct Amit’s reported task with a one-time, ID-specific repair after confirming the existing lead-to-professional relationship. The repair will preserve the task’s lead reference while replacing the relationship reference with Amit’s verified professional profile, allowing both the lead and professional context to remain available.
2. Do not run a global historical conversion. The existing data model intentionally treats lead tasks and professional tasks differently, and a lead’s Builder designation alone does not prove every task is a professional task. For any future missing-link reports, use the same ID-specific verification rather than guessing from name, role, or phone number.
3. Add a focused regression test for the task-link display rule: only a task explicitly linked to a professional exposes the professional profile action; a normal lead task remains a lead task; and a task carrying both the preserved lead and verified professional reference shows both contexts.
4. Verify the repaired data in the task list and task detail view: Amit’s task retains its lead context and exposes a clickable professional profile link. Run the focused test and the existing TypeScript check.

## Technical details

```text
Before: task -> lead (Amit) only
After:  task -> lead (Amit) + professional profile (Amit, Builder)
```

- The change is a one-time, ID-specific data repair; it does not alter existing task permissions or the normal task-creation workflow.
- This approach avoids a speculative bulk repair: a matching name, profession, or phone number is not sufficient proof that an ordinary lead task should become a professional task.  
  
  
Please update and expand your plan with the following architectural rules so we fix all 35 unambiguous historical tasks (including Amit) AND prevent this gap from recurring when new tasks are created on professional leads:
  ### UPDATED PLAN ADDENDUM
  #### 1. Backfill All 35 Unambiguous Historical Tasks (Not Just Amit's Single Task)
  In our CRM architecture `Leads.tsx` and `EditSmartLeadForm.tsx`), whenever a Lead's own primary designation is a professional `isProfessionalDesignation(lead.designation)` is true, e.g., `builder`, `architect`, `contractor`, `interior_designer`) and its normalized 10-digit phone matches a single profile in `public.professionals`, the Lead and the Professional represent the exact same 1-to-1 person. Those 35 historical tasks only have `related_entity_type = 'lead'` because they were created before the lead-to-professional task linking feature shipped.
  Instead of repairing only 1 task and leaving 34 identical tasks broken, perform a guarded, idempotent repair for **all 35 unambiguous tasks** that satisfy ALL of the following strict conditions:
  - `t.lead_id IS NOT NULL` and `(t.related_entity_type IS NULL OR t.related_entity_type = 'lead')`
  - The joined lead `l` has a professional designation `isProfessionalDesignation(l.designation)` — i.e., `architect`, `interior_designer`, `contractor`, `builder`, `engineer`, `pmc`, `consultant`, `structural_engineer`, `landscape_architect`, `site_supervisor`, `real_estate_developer`, `kitchen_maker`, `supplier`, `vendor`, `partner`). **Never** convert a Homeowner lead `owner`, `buyer`, `family_member`).
  - The lead's normalized 10-digit phone `right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)`) is non-empty (10 digits) and matches **exactly one** active professional in `public.professionals` (or matches a `lead_professionals` row with `is_primary_contact = true` where phone numbers also align).
  - **Preserve `t.lead_id` unchanged**, and set `t.related_entity_type = 'professional'` and `t.related_entity_id = p.id`.
  #### 2. Dynamic Fallback in Task UI / `useLeadBrief.ts` `TaskDetailView.tsx` & `EnhancedTaskTable.tsx`)
  Ensure that if a task has `lead_id` pointing to a Lead whose own designation is a professional `isProfessionalDesignation(lead.designation)` is true), the task view / `useLeadBrief` hook resolves the linked Professional profile (via explicit `related_entity_type === 'professional'`, OR `lead_professionals` with `is_primary_contact = true`, OR an unambiguous 10-digit normalized phone match in `public.professionals`) so the clickable Professional profile link always renders in the Task list and Task detail view even if a task was saved with `related_entity_type = 'lead'`.
  - **Strict Guard:** If `!isProfessionalDesignation(lead.designation)` (e.g., a Homeowner lead that merely has an Architect as a referrer or additional contact), do NOT resolve the site architect as the task's primary professional profile.
  #### 3. Future Task Creation Safeguard in `useTasks.ts`
  When creating a task bound to a Lead `task.lead_id` is set and `related_entity_type` is `'lead'` or omitted), if that Lead has `isProfessionalDesignation(lead.designation) === true` and resolves to an unambiguous primary professional profile (via `lead_professionals.is_primary_contact = true` or a single 10-digit phone match in `public.professionals`), automatically set `related_entity_type = 'professional'` and `related_entity_id = primaryProfessionalId` while preserving `lead_id = lead.id` (matching the existing behavior in `Leads.tsx` and `EditSmartLeadForm.tsx`).
  #### 4. Focused Regression Tests (TDD)
  Add unit/regression tests covering:
  1. A task with `lead_id` + `related_entity_type = 'professional'` displays both the Lead context and the clickable Professional profile link.
  2. A legacy task with `related_entity_type = 'lead'` on a Builder/Architect lead `isProfessionalDesignation = true`) with a single matching 10-digit phone professional resolves and exposes the Professional profile link.
  3. A Homeowner lead task `designation = 'owner'`) linked to a site architect via `lead_professionals` `is_primary_contact = false`) remains strictly a lead task and does not turn into a professional task.
  4. Run `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json` to verify zero new errors.
  ### CRITICAL INVARIANTS
  - NEVER null out `tasks.lead_id` when setting `related_entity_type = 'professional'`.
  - NEVER modify `.gitignore` or lockfiles, and do not raise modal `DialogContent` above `z-50`.
  - Keep `assigned_to`, `created_by`, and `updated_by` strictly as staff `full_name` strings (INVARIANT-04).