# Filter Numeric Operators + Reschedule Automation

## Audit findings (Task 0)

- **AUDIT-A**: `TaskSavedFilterDialog.tsx` OPERATORS — **does NOT have `number` key** (text/select/date/boolean only). ✅ Matches expectation. Same gap exists in `ProfessionalSavedFilterDialog.tsx`. `Leads` and `Customers` filter dialogs **already have a `number` key** but I'll verify and align operator naming.
- **AUDIT-B**: `filterRuleEngine.ts` handles both `greater_than_or_equal` AND legacy `greater_or_equal` (same for `less_*`) in the switch — both strings are safe. I'll use the full `greater_than_or_equal` form per the prompt.
- **AUDIT-C**: `AddAutomationRuleDialog.tsx` uses `ENTITY_FIELDS` from `src/constants/automationConstants.ts`. The `tasks` entry (lines 267–312) **does NOT list `reschedule_count**` — needs to be added.
- **AUDIT-D**: `run-automations/index.ts` **has** `singularEntityType` normalization (line 325) — the customer "---" fix is in code. It just needs redeployment. Separately, `compareValues` (lines 100–126) only handles `equals/not_equals/contains/starts_with/ends_with/greater_than/less_than/is_empty/is_not_empty` — **missing `greater_than_or_equal` and `less_than_or_equal**`.

## Changes

### Task 1 — Numeric operators in filter dialogs

1. `TaskSavedFilterDialog.tsx`: add `number` block to OPERATORS (equals, not_equals, greater_than, greater_than_or_equal, less_than, less_than_or_equal, is_empty, is_not_empty). Extend value renderer: when `getFieldType(rule.field) === "number"`, render `<Input type="number" min={0} />`.
2. `ProfessionalSavedFilterDialog.tsx`: same OPERATORS addition + number input renderer (currently falls back to text input for `rating`/`total_projects`).
3. `SavedFilterDialog.tsx` (leads) and `CustomerSavedFilterDialog.tsx`: verify the existing `number` block matches the canonical operator names; if it uses legacy `greater_or_equal`/`less_or_equal`, update to `greater_than_or_equal`/`less_than_or_equal` for consistency. Verify number input is used.

### Task 2 — Reschedule count as automation trigger

1. `src/constants/automationConstants.ts` — in the `tasks` ENTITY_FIELDS array add:
  ```ts
   { name: "reschedule_count", label: "Reschedule Count", type: "number", editable: false }
  ```
2. `src/components/automation/TriggerConditionBlock.tsx` — the field_matches operator list (lines 274–283) is hardcoded; extend it so when `selectedField?.type === "number"` it shows the full numeric operator set including `greater_than_or_equal` and `less_than_or_equal` (and uses `<Input type="number" min={0} />` in `FieldValueSelector` path). Confirm `FieldValueSelector` already renders a number input for `type === "number"` fields; if not, no change needed beyond passing the field through.
3. `supabase/functions/run-automations/index.ts` — extend `compareValues` switch with:
  ```ts
   case "greater_than_or_equal": return parseFloat(actual) >= parseFloat(expected);
   case "less_than_or_equal":    return parseFloat(actual) <= parseFloat(expected);
  ```

### Task 3 — Redeploy run-automations

Use `supabase--deploy_edge_functions` with `["run-automations"]` after the edge-function code edits above land. This redeploys the already-merged singular-entity-type fix and the new numeric operator support together.

## Out of scope

All items in the prompt's explicit out-of-scope list.

## Acceptance check

After edits + deploy: Tasks filter shows numeric operators for Reschedule Count (AC-1/2/4), Automation rule on `reschedule_count >= 7` can be created (AC-3), and any automation creating a customer-linked task shows the customer name (AC-5).  
  
  
CORRECTION TO TASK 1:

For src/components/leads/filters/SavedFilterDialog.tsx and

src/components/customers/filters/CustomerSavedFilterDialog.tsx:

DO NOT change or rename existing number operators.

These files already have a working number operator block using

"greater_or_equal" and "less_or_equal". Leave those strings

exactly as they are.

Only verify that:

(a) the number type block exists in OPERATORS

(b) the value input for number fields renders as

    <Input type="number" min={0} /> — fix ONLY if it is

    currently a text input

For TaskSavedFilterDialog.tsx and ProfessionalSavedFilterDialog.tsx

(which are new additions with no existing saved filters):

Use "greater_than_or_equal" and "less_than_or_equal" as specified.

Rationale: filterRuleEngine.ts handles both string variants.

Changing the leads/customers dialogs would orphan existing

saved filter records stored in Supabase with the old strings.