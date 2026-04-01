

## Multi-Part Bug Fix Plan (9 Issues)

### Part 1: Quick Wins (6 fixes, no dependencies)

**Fix 1 — `src/pages/Leads.tsx`**: Line 65 uses `.email`, line 138 uses `assignedToEmail`. Change both to use `.name`.
- Line 65: `staffMembers.find(m => m.id === formData.assignedTo)?.email` → `?.name`
- Line 138: `const assignedToEmail = matchedStaff?.email` → `const assignedToName = matchedStaff?.name`
- Line 146: `assigned_to: assignedToEmail` → `assigned_to: assignedToName`

**Fix 2 — `src/components/leads/BulkUploadDialog.tsx`**: Three locations storing email instead of name.
- Line 513: `assignedToEmail = matchedStaff?.email || matchedStaff?.name || ...` → `assignedToName = matchedStaff?.name || assignedToRaw || staffMembers[0]?.name || 'Unassigned'`
- Line 526: `assigned_to: assignedToEmail` → `assigned_to: assignedToName`
- Line 895: `assigned_to: assignedMember?.email || assignedMember?.name || ...` → `assigned_to: assignedMember?.name || staffMembers[0]?.name || 'Unassigned'`

**Fix 3 — `src/hooks/useTasks.ts`**: Line 214, `addTask` pushes raw DB row without `calculatedStatus`.
- Change `setTasks((prev) => [...prev, data])` → `setTasks((prev) => [...prev, { ...data, calculatedStatus: calculateTaskStatus(data) }])`

**Fix 4 — `src/hooks/useKitDashboard.ts`**: Already fixed (line 59-60 shows the filter is already commented out). No action needed.

**Fix 6 — `src/components/dashboard/RemindersWidget.tsx`**: Missing task entity_type handler.
- Import `useTaskDetailModal` from `@/contexts/TaskDetailModalContext`
- Add `const { openTask } = useTaskDetailModal()` at component top
- Add `else if (reminder.entity_type === 'task') { openTask(reminder.entity_id); }` in `handleReminderClick`

**Fix 9 — `src/pages/Professionals.tsx`**: Uses `?selected=` param but all navigation uses `?view=`. Need to also check for `view` param.
- In the existing `useEffect` (line 22-33), add: also check `searchParams.get("view")` alongside `searchParams.get("selected")`, so both URL patterns work.

### Part 2: Filter Engine Fix (2 fixes)

**Fix 5A — `src/components/tasks/EnhancedTaskTable.tsx`**: `evaluateRules` receives raw `task.status` ("Pending") but the saved filter compares against computed status ("Overdue").
- Line 590: Spread `computedStatus` into the record: `evaluateRules({ ...task, status: task.computedStatus || task.calculatedStatus || task.status } as Record<string, any>, activeAdvancedRules)`
- Line 626: Same pattern for `getFilterCount`

**Fix 5B — `src/components/tasks/filters/TaskSavedFilterDialog.tsx`**: `uniqueAssignedTo` receives `a.label` (display format like "Admin - Nipun Tantia") at line 1696 of EnhancedTaskTable. The filter dropdown shows these labels and saves them as rule values, but `evaluateRules` compares against raw `task.assigned_to` (just the name).
- In `EnhancedTaskTable.tsx` line 1696: Change `uniqueAssignees.map(a => a.label)` → `uniqueAssignees.map(a => a.value)` so the filter dialog receives raw names
- In `TaskSavedFilterDialog.tsx` line 297: The options already map value→value, label→label from what's passed in. Since we now pass raw names as values, we need to build proper labels. Change to: `return uniqueAssignedTo.map(a => ({ value: a, label: getStaffDisplayName(a, staffMembers) || a }))` — import `getStaffDisplayName` and `useActiveStaff`

### Part 3: Follow-up Task Auto-Close

**Fix 8A — `src/components/tasks/TaskCompletionDialog.tsx`**: When follow-up is created (line 345-376), the parent task stays open if "Close Task" is unchecked. After `await addTask(nextTask)` (line 369), add auto-close logic:
```typescript
if (!closeTask) {
  await updateTask(task.id, {
    status: "Completed",
    completed_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    closed_by: user?.id,
    completion_notes: notes.trim() || `Follow-up created: Follow-up: ${task.title}`,
  });
  await logTaskActivity(task.id, "closed", {
    closed_by: user?.id,
    reason: "Auto-closed: follow-up task created",
  });
}
```

**Fix 8B** — Parent task link in `TaskDetailView.tsx`: Already implemented in a previous iteration (parent banner + follow-up links exist). Verify and confirm — no new code needed.

### Part 4: SQL Data Cleanup (post-deploy)

Run SQL migration to fix existing records with email in `assigned_to`:
```sql
UPDATE tasks SET assigned_to = p.full_name FROM profiles p
WHERE p.email = tasks.assigned_to AND p.full_name IS NOT NULL AND tasks.assigned_to LIKE '%@%';

UPDATE leads SET assigned_to = p.full_name FROM profiles p
WHERE p.email = leads.assigned_to AND p.full_name IS NOT NULL AND leads.assigned_to LIKE '%@%';
```

### Files Changed

| # | File | Fix |
|---|------|-----|
| 1 | `src/pages/Leads.tsx` | assigned_to uses .name |
| 2 | `src/components/leads/BulkUploadDialog.tsx` | assigned_to uses .name (3 places) |
| 3 | `src/hooks/useTasks.ts` | addTask adds calculatedStatus |
| 4 | `src/components/dashboard/RemindersWidget.tsx` | task reminder click handler |
| 5 | `src/pages/Professionals.tsx` | handle ?view= URL param |
| 6 | `src/components/tasks/EnhancedTaskTable.tsx` | evaluateRules gets computedStatus + pass raw names to filter dialog |
| 7 | `src/components/tasks/filters/TaskSavedFilterDialog.tsx` | display labels for raw name values |
| 8 | `src/components/tasks/TaskCompletionDialog.tsx` | auto-close parent on follow-up creation |
| 9 | SQL migration | clean up email→name in assigned_to |

