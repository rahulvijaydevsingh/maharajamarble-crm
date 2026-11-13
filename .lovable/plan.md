# Repair missing professional links on older tasks

## Verified finding
- Amit’s Builder profile exists and is linked to his lead through the same normalized phone number.
- His affected follow-up task is stored as a lead task (`related_entity_type = lead` and `related_entity_id = lead_id`), so the task screen has no professional profile reference to show.
- The task screen only renders the professional link when the task itself is marked as related to a professional. New task creation already supports this model.
- A cautious scan identified 35 historical tasks where the lead has a professional designation and exactly one matching professional profile by normalized phone number. Amit’s task is in this group. No ambiguous match is included in that count.

## Plan
1. Add one narrowly scoped database repair that updates only the verified historical tasks where all of these conditions hold:
   - the task is currently linked to its own lead;
   - that lead has a recognised professional designation;
   - exactly one professional profile has the same normalized phone number.
   The repair will preserve each task’s lead reference while replacing the relationship reference with that verified professional profile, allowing both the lead and professional context to remain available.

2. Add a small, reusable eligibility definition in the repair so the criteria are explicit, repeatable, and exclude missing, duplicate, or ambiguous phone matches. It will not relink customer tasks, unrelated lead tasks, or tasks already linked to a professional.

3. Add a focused regression test for the eligibility logic using concrete cases: Amit’s Builder-style lead/profile match links successfully; an ambiguous match does not change; a non-professional lead does not change; and an already professional-linked task remains unchanged.

4. Verify the repaired data in the task list and task detail view: Amit’s task retains its lead context and exposes a clickable professional profile link. Re-check the total repaired rows against the pre-repair candidate count, then run the focused test and the existing TypeScript check.

## Technical details
```text
Before: task -> lead (Amit) only
After:  task -> lead (Amit) + professional profile (Amit, Builder)
```

- The change is a one-time, restrictive data repair; it does not alter existing task permissions or the normal task-creation workflow.
- Matching uses normalized ten-digit phone numbers and requires one-and-only-one professional candidate, preventing guesswork from names or profession labels alone.
