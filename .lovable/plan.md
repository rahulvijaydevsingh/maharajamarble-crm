

## Three-Part Fix: Tasks Column Display, Edit Task Form, and Document Status Review

### Issue 1: Tasks Column in Leads Table — Show Total + Overdue

**Problem**: The `PendingTasksBadge` in `EnhancedLeadTable.tsx` shows `taskInfo.total` as a single number badge colored by urgency. The badge already shows total pending tasks, but the user wants to see both **overdue count** and **total count** together — not just a single number.

**Fix**: Update the `PendingTasksBadge` component (lines 688-742 of `EnhancedLeadTable.tsx`) to display the badge as `"{overdue}/{total}"` format when there are overdue tasks, and just `"{total}"` when there are none. For example: `"2/5"` means 2 overdue out of 5 total pending tasks. The tooltip already shows the breakdown — this makes it visible at a glance.

**File**: `src/components/leads/EnhancedLeadTable.tsx` — modify `PendingTasksBadge` render (line ~740) to show `{taskInfo.overdue > 0 ? `${taskInfo.overdue}/${taskInfo.total}` : taskInfo.total}`.

---

### Issue 2: Edit Task Form Not Loading Values Properly

**Problem**: When opening EditTaskDialog, the `due_date` (a DATE string like `"2026-03-15"`) is parsed with `new Date("2026-03-15")` which creates a UTC midnight date — this can shift to the previous day in positive UTC offset timezones (like IST). The `due_time` loading looks correct in the code (line 155), but the related entity resolution depends on the task having a joined `lead` object, which only works if `lead_id` is set (not `related_entity_id`).

**Fixes** (all in `src/components/tasks/EditTaskDialog.tsx`):

1. **Due Date timezone fix** (line 154): Change `new Date(taskData.due_date)` to parse as local date:
   ```typescript
   dueDate: taskData.due_date ? new Date(taskData.due_date + 'T00:00:00') : undefined,
   ```

2. **Related entity name resolution**: When `related_entity_type` is set but `lead?.name` is unavailable (task uses `related_entity_id` instead of `lead_id`, or entity is customer/professional), the name shows as "Unknown". Fix by querying the entity from the database when `taskData.lead?.name` is missing (lines 174-199). Add an async lookup in the `useEffect` that fetches from the correct table based on `related_entity_type`.

3. **Due time edge case**: The `due_time` field already loads from `taskData.due_time`. Verify the HTML `<input type="time">` receives the correct HH:MM format — if the DB stores values like `"10:00:00"` (with seconds), it still works with the time input. No change needed here.

**File**: `src/components/tasks/EditTaskDialog.tsx`

---

### Issue 3: Document Completion Status

After reviewing the full document (Lead Lifecycle Spec), here is the implementation status:

| Document Prompt | Description | Status |
|---|---|---|
| **Prompt 1** (DB Foundation) | Orphaned task cleanup, lead columns, lead_lost_reasons table, task columns, can_delete_leads | **Done** — all columns exist in schema, lead_lost_reasons table seeded |
| **Prompt 2** (Status Model) | 6-status model, Pending Lost banner, Approve/Reject, RLS | **Done** — pending_lost status in all UI components, PendingLostBanner with approve/reject, MarkAsLostDialog |
| **Prompt 3** (Recycle Bin) | Soft delete, SoftDeleteLeadDialog, LeadRecycleBin UI, restore/permanent delete | **Done** — SoftDeleteLeadDialog, LeadRecycleBin with restore/bulk delete |
| **Prompt 4** (Lost Flow + Archive) | Mark as Lost flow, Archive section, phone duplicate detection, re-engagement | **Done** — LeadArchive component, DuplicateLeadModal, cooling-off logic in approve handler |
| **Prompt 5** (Automation Extensions) | Handle Lead Tasks action, auto In Progress rule, pre-configured rules | **Partially Done** — HandleLeadTasksActionConfig exists in automation UI, but pre-configured rules (Auto In Progress, Pending Lost Manager Approval, Cooling-Off Reminder) need to be verified if they were seeded as active automation rules |

The document's 5 lead lifecycle prompts are essentially **complete** in terms of UI and DB schema. The remaining concern is whether the 3 automation rules from Prompt 5 Part C were actually seeded/created as active rules in the automation_rules table.

---

### Implementation Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/components/leads/EnhancedLeadTable.tsx` | Update PendingTasksBadge to show overdue/total format |
| 2 | `src/components/tasks/EditTaskDialog.tsx` | Fix due_date timezone parsing + async entity name resolution |

No database changes needed.

