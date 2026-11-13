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
