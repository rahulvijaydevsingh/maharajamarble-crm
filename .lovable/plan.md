# Comprehensive Fix Plan: 8 Issues

## Issues and Root Causes


| #   | Issue                                                                | Root Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | KIT task title doesn't include touch type                            | `KitProfileTab.tsx` line 176: task title uses `taskTitle` or generic `getKitTaskType(touch.method) with {entityName}` but doesn't include the method label in the title consistently. The `getKitTaskType` function returns e.g. "KIT Call" which IS the type, but the default title format is `KIT Call with {name}` which is correct. However, when user provides a custom taskTitle (line 176), it appends the method, which is correct. Need to verify this is actually working.                                |
| 2   | Lead Tasks tab has no "Type" column and no column manager            | `LeadTasksTab.tsx` has a hardcoded table with columns: Title, Description, Due Date, Time, Priority, Status, Assigned To, Created, Updated, Actions. There is no "Type" column and no `ColumnManagerDialog` integration.                                                                                                                                                                                                                                                                                            |
| 3   | Touch edit doesn't sync time/date to linked task/reminder            | The code at `KitProfileTab.tsx` lines 477-504 DOES sync. But the `addTouch` handler (line 370-437) creates a task but never links (`linked_task_id`) back to the new touch because `addTouchMutation` in `useKitTouches.ts` doesn't return the created touch ID, so the linking between touch and task is broken for newly added touches.                                                                                                                                                                           |
| 4   | Deleting a touch doesn't delete linked task/reminder                 | There is NO touch deletion feature at all. The UI only has skip, complete, snooze, reschedule, and edit. There's no delete touch functionality in `useKitTouches.ts`. the cancel KIT also can be considered as deletion and in case of skip it can be considered as delete.                                                                                                                                                                                                                                         |
| 5   | Activity log shows "View lead" instead of "View task" for KIT events | The `logTouchEdited` function passes `linkedTaskId` which sets `relatedEntityType: 'task'`. However, the `logActivity` function (line 53-54) defaults `relatedEntityType` to `entityType` (lead/customer) when `relatedEntityType` is `undefined`. If `linkedTaskId` is undefined/null/falsy, it falls back to the entity type. The issue: `editingTouch.linked_task_id` is null for touches created via `addTouch` handler because the touch-task link was never established (see issue 3).                        |
| 6   | Bulk task type dropdown appears behind dialog                        | `SelectContent` inside the bulk action dialog at line 1506 has no z-index. The dialog has `z-[60]`, but `SelectContent` renders in a portal at default z-index, appearing behind the dialog.                                                                                                                                                                                                                                                                                                                        |
| 7   | Page becomes unresponsive after cancelling bulk action dialog        | The `hideOverlay` on the bulk action dialog (line 1448) uses a transparent `DialogPrimitive.Overlay` which should handle cleanup. But the `onOpenChange` handler doesn't clear `selectedTasks`, so task checkboxes stay checked. The main issue: when `setBulkActionDialogOpen(false)` is called via the Dialog's `onOpenChange`, React state is still holding selected tasks but the overlay cleanup may not be releasing scroll lock properly. Adding `modal={false}` to the dialog would prevent scroll locking. |
| 8   | Edge function error when adding staff                                | The CORS headers in `create-staff-user/index.ts` line 12 are missing newer Supabase client headers: `x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version`. This causes preflight CORS failures.                                                                                                                                                                                                                                            |


---

## Fix Details

### Fix 1: Task Title with Touch Type (Already Working, Verify)

The code already creates task titles with touch type: `KIT Call with {entityName}` (line 177). The `type` field is set via `getKitTaskType(touch.method)` (line 183). This should be working correctly. No change needed unless the user provided a custom title that overrides the method label. Verify the activation flow creates correct titles.

### Fix 2: Add "Type" Column to LeadTasksTab

**File:** `src/components/leads/detail-tabs/LeadTasksTab.tsx`

Add a "Type" column to the hardcoded table between "Title" and "Description":

- Add `<TableHead>Type</TableHead>` in the header
- Add `<TableCell><Badge variant="outline">{task.type}</Badge></TableCell>` in the body

### Fix 3: Fix Touch-Task Linking for Added Touches

**File:** `src/hooks/useKitTouches.ts` - `addTouchMutation`

The `addTouchMutation` doesn't return the created touch. Change it to `.select().single()` to return the new touch, so `KitProfileTab.tsx` can link it.

**File:** `src/components/kit/KitProfileTab.tsx` - `handleAddTouch`

After creating the task, update the newly created touch with `linked_task_id` and `linked_reminder_id`.

### Fix 4: Add Touch Deletion with Cleanup

**File:** `src/hooks/useKitTouches.ts`

Add a `deleteTouchMutation` that:

1. Fetches the touch's `linked_task_id` and `linked_reminder_id`
2. Deletes the linked task and reminder
3. Deletes the touch itself

**File:** `src/components/kit/KitProfileTab.tsx`

Add `onDelete` handler to `KitTouchCard` components. Wire it to the new `deleteTouch` function.

**File:** `src/components/kit/KitTouchCard.tsx`

Add a delete button (Trash icon) next to the edit button, visible for pending touches.

### Fix 5: Activity Log "View Task" for KIT Events

This will be fixed by Fix 3 - once touches are properly linked to tasks via `linked_task_id`, the `logTouchEdited` function will correctly pass `linkedTaskId` which sets `relatedEntityType: 'task'`, making "View task" appear instead of "View lead".

### Fix 6: Bulk Task Type Dropdown Z-Index

**File:** `src/components/tasks/EnhancedTaskTable.tsx`

Add `className="z-[200]"` to all `SelectContent` elements inside the bulk action dialog (lines 1474, 1490, 1506, 1522) to ensure they render above the `z-[60]` dialog.

### Fix 7: Page Unresponsiveness After Bulk Action Cancel

**File:** `src/components/tasks/EnhancedTaskTable.tsx`

Remove `hideOverlay` from the bulk action dialog. The bulk dialog is a top-level dialog (not nested), so it should use the standard overlay. The `hideOverlay` with transparent Radix overlay may be causing scroll lock issues on cancel. Also, in the `onOpenChange` callback, clear selected tasks and reset bulk action state.

Change:

```tsx
<DialogContent className="sm:max-w-[400px] z-[60]" hideOverlay>
```

To:

```tsx
<DialogContent className="sm:max-w-[400px]">
```

And update `onOpenChange`:

```tsx
<Dialog open={bulkActionDialogOpen} onOpenChange={(open) => {
  setBulkActionDialogOpen(open);
  if (!open) {
    setBulkActionType("");
    setBulkActionValue("");
    setBulkRescheduleDate(undefined);
  }
}}>
```

### Fix 8: Edge Function CORS Headers

**File:** `supabase/functions/create-staff-user/index.ts`

Update CORS headers to include all required Supabase client headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

Also update all other edge functions (`reset-staff-password`, `update-staff-profile`, `update-staff-role`, `seed-demo-users`, `crm-backup-create`, `crm-backup-list`, `crm-backup-restore`) with the same CORS headers.

---

## Files to Modify


| File                                                | Changes                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Add "Type" column to task table                                                             |
| `src/hooks/useKitTouches.ts`                        | Return created touch from `addTouchMutation`; add `deleteTouchMutation`                     |
| `src/components/kit/KitProfileTab.tsx`              | Fix `handleAddTouch` to link task/reminder to touch; add touch delete handler               |
| `src/components/kit/KitTouchCard.tsx`               | Add delete button for pending touches                                                       |
| `src/components/tasks/EnhancedTaskTable.tsx`        | Fix bulk dialog: add z-index to SelectContent, remove hideOverlay, fix onOpenChange cleanup |
| `supabase/functions/create-staff-user/index.ts`     | Update CORS headers                                                                         |
| `supabase/functions/reset-staff-password/index.ts`  | Update CORS headers                                                                         |
| `supabase/functions/update-staff-profile/index.ts`  | Update CORS headers                                                                         |
| `supabase/functions/update-staff-role/index.ts`     | Update CORS headers                                                                         |
| `supabase/functions/seed-demo-users/index.ts`       | Update CORS headers                                                                         |
| `supabase/functions/crm-backup-create/index.ts`     | Update CORS headers                                                                         |
| `supabase/functions/crm-backup-list/index.ts`       | Update CORS headers                                                                         |
| `supabase/functions/crm-backup-restore/index.ts`    | Update CORS headers                                                                         |


## Implementation Order

1. Fix edge function CORS headers (Fix 8)
2. Fix touch-task linking in addTouch (Fix 3)
3. Add touch deletion with cleanup (Fix 4)
4. Add Type column to LeadTasksTab (Fix 2)
5. Fix bulk action dialog z-index and responsiveness (Fix 6 + 7)
6. Deploy edge functions