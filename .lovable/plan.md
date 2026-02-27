

## Plan: Fix Tasks Column Sort/Filter, Date Range Filtering, and Bulk Actions for Field Agent

### Issue 1: Tasks Column Missing Sort and Filter

**Problem:** The "Tasks" column in the Leads table only renders a plain label with no sort or filter capabilities, unlike other columns.

**Solution:** 
- Add a new sort field type `"tasks"` to the `SortField` type
- Add a `MultiSelectFilter` to the Tasks column header with options like "Has Tasks", "Has Overdue", "No Tasks"
- In the sorting logic, sort by task count from `getLeadTasks()`
- In the filtering logic, add a `tasksFilter` state and filter leads based on their pending task status
- Pass the new filter and task-related data through to `LeadsTableContainer`

**Files to modify:**
- `src/components/leads/EnhancedLeadTable.tsx` — add `tasksFilter` state, update `SortField` type, update `filteredLeads` to filter by task count, pass new props
- `src/components/leads/LeadsTableContainer.tsx` — update `SortField` type, add `tasksFilter` props, update `renderTableHeader` for the `tasks` case to include sort + filter UI

---

### Issue 2: Date Range Filter Requires Both Dates

**Problem:** The date range filter only applies when BOTH start and end dates are selected. Selecting only one date (e.g., end date = Feb 19) does nothing, still showing leads with dates beyond the selection. Additionally, end-date comparison doesn't include the full day (e.g., selecting Feb 19 as end date should include all of Feb 19).

**Solution:**
- Change the filtering logic from `!from || !to || (condition)` to support single-date filtering:
  - If only `from` is set: show records on or after that date
  - If only `to` is set: show records on or before that date
  - If both are set: show records in the range (and auto-swap if from > to)
- Normalize the `to` date to end-of-day (23:59:59) for inclusive comparison
- Apply this fix to all three date range filters: `createdDateRange`, `lastFollowUpRange`, and `nextFollowUpRange`

**File to modify:**
- `src/components/leads/EnhancedLeadTable.tsx` — rewrite the date filter conditions in the `filteredLeads` useMemo (lines 326-333)

---

### Issue 3: Bulk Actions Not Showing for Field Agent

**Problem:** Field agent has `leads.bulk_actions` in the database `custom_role_permissions` table, but the bulk action button doesn't appear when leads are selected.

**Root Cause:** The `usePermissions` hook has a subtle issue. When `customPermissions` is being fetched (async), the `getPermissionsForRole` function falls back to `defaultRolePermissions["field_agent"]`, which does NOT include `leads.bulk_actions`. Even after fetch completes, the issue may persist if the component doesn't properly re-evaluate. More critically, if the RPC `get_user_role` or the custom_role_permissions fetch fails or returns empty, the default hardcoded permissions are used, which don't include bulk actions for field_agent.

**Solution:**
- Update `defaultRolePermissions` for `field_agent` in `usePermissions.ts` to include `leads.bulk_actions` (matching what the admin configured in the DB)
- Ensure `canBulkAction` checks work correctly by making sure custom permissions from DB are properly merged/used
- Verify the same for other roles (manager, sales_user) by cross-referencing their DB permissions with the hardcoded defaults

**File to modify:**
- `src/hooks/usePermissions.ts` — update `defaultRolePermissions.field_agent` to include `"leads.bulk_actions"` as a default

---

### Technical Details

**Date range fix (pseudo-code):**
```text
For each date filter (created, lastFollowUp, nextFollowUp):
  - Normalize from/to: if from > to, swap them
  - Set toEnd = to date at 23:59:59.999
  - If only from: date >= from
  - If only to: date <= toEnd  
  - If both: from <= date <= toEnd
```

**Tasks sort/filter additions:**
- New state: `tasksFilter: string[]` with options `["has_tasks", "has_overdue", "no_tasks"]`
- Sort by `getLeadTasks(lead.id).total` when sort field is `"tasks"`
- Filter: if `has_tasks` selected, only show leads where total > 0; if `has_overdue`, only leads with overdue > 0; if `no_tasks`, only leads with total === 0

