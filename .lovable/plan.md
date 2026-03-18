

## Filter System: Duplicate Bug Fix + Missing Filter Options

### Bug: Duplicate Rules on Edit

**Root Cause**: When saving a filter, `buildFilterConfig()` stores each rule in BOTH `advancedRules` AND legacy arrays (e.g., `priorityFilter`, `statusFilter`). When loading for edit, the `useEffect` parses BOTH the legacy arrays AND `advancedRules`, creating duplicate rules.

Example: Saving a filter with `priority = Medium` creates:
- `priorityFilter: ["Medium"]` (legacy)
- `advancedRules: [{field: "priority", operator: "equals", value: "Medium"}]`

On edit, both are parsed into separate rules = 2 identical conditions shown.

**Fix**: In all 4 filter dialogs, when `advancedRules` exists and has entries, load ONLY from `advancedRules` and skip legacy array parsing. Legacy arrays should only be used as fallback for old filters that don't have `advancedRules`.

**Affected files**:
1. `src/components/tasks/filters/TaskSavedFilterDialog.tsx` (lines 188-251)
2. `src/components/leads/filters/SavedFilterDialog.tsx` (lines 178-249)
3. `src/components/customers/filters/CustomerSavedFilterDialog.tsx` (same pattern)
4. `src/components/professionals/filters/ProfessionalSavedFilterDialog.tsx` (same pattern)

---

### Missing Filter Options

#### Leads Filter — Expand Tasks Category
Currently only has `pending_tasks` (number). Add:
- `overdue_tasks` — "Overdue Tasks Count" (number) 
- `due_today_tasks` — "Due Today Tasks" (number)
- `upcoming_tasks` — "Upcoming Tasks" (number)
- `tasks_status` — "Tasks Status" (select: has_tasks, has_overdue, no_tasks) — matches the inline table filter
- `designation` — "Designation" (select) — exists in leads table
- `kit_status` — "KIT Status" (select) — exists in leads table
- `is_converted` — "Converted" (boolean) — exists in leads table

#### Professionals Filter — Add Missing Fields
Currently missing several fields that exist on the `professionals` table:
- `verified` — "Verified" (boolean)
- `kit_status` — "KIT Status" (select)
- `notes` — "Notes" (text)
- `site_plus_code` — "Site Plus Code" (text)

#### Customers Filter — Expand Tasks Category  
Currently has `pending_tasks` as select. Add similar task breakdown:
- `overdue_tasks` — "Overdue Tasks" (number)
- `has_notes` — "Has Notes" (boolean)

#### Tasks Filter — Add Missing Fields
- `completion_outcome` — "Completion Outcome" (text)
- `reschedule_count` — "Reschedule Count" (number)
- `deal_ready` — "Deal Ready" (boolean)
- `parent_task_id` — "Has Parent Task" (boolean) — for chain filtering

---

### Implementation Plan

| # | File | Changes |
|---|------|---------|
| 1 | `TaskSavedFilterDialog.tsx` | Fix edit duplicate bug (prefer advancedRules over legacy); add completion_outcome, reschedule_count, deal_ready, parent_task_id fields |
| 2 | `SavedFilterDialog.tsx` (Leads) | Fix edit duplicate bug; add overdue_tasks, due_today_tasks, upcoming_tasks, tasks_status, designation, kit_status, is_converted fields |
| 3 | `CustomerSavedFilterDialog.tsx` | Fix edit duplicate bug; add overdue_tasks field |
| 4 | `ProfessionalSavedFilterDialog.tsx` | Fix edit duplicate bug; add verified, kit_status, notes fields |

The fix pattern is identical across all 4 files — wrap legacy array parsing in `if (!config.advancedRules?.length)` so it only runs for old filters without advancedRules.

