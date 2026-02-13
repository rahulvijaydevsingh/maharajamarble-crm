
# Comprehensive Fix Plan: KIT Cycle Restart, Scroll, Sync, Activity Log, and Bulk Edit Issues

## Issues Identified and Root Causes

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Custom single-touch cycle skip gives "No touch sequence defined" on restart | `createNextCycleMutation` in `useKitSubscriptions.ts` (line 289) gets `touchSequence` from `preset?.touch_sequence`. Custom sequences have NO preset (`preset_id = null`), so `touchSequence = []`, triggering the error on line 292. The original custom sequence is never stored. |
| 2 | KIT cancel doesn't delete linked tasks/reminders | `cancelMutation` in `useKitSubscriptions.ts` only updates subscription status. It never queries the subscription's touches for `linked_task_id`/`linked_reminder_id` to delete them. |
| 3 | Meeting/Visit doesn't link to profile address | The `KitTouchCard` shows address as plain text (line 154-158) with a MapPin icon but no clickable link. It should navigate to the lead/customer profile tab. However, linking to the profile tab is complex; a Google Maps link from the address is more useful. |
| 4 | Touch edit doesn't sync time to task/reminder | `handleEditTouch` in `KitProfileTab.tsx` (line 482-484) does update `due_time` and `reminder_datetime`. Need to verify if `due_time` column exists on `tasks` table and if the update is actually executing. The `linked_task_id` may be null if the touch was created before per-touch task creation was implemented. |
| 5 | Filter dropdown and Add Task button not working in lead profile Tasks tab | `LeadTasksTab` filter `SelectContent` (line 184) has NO z-index. It renders behind the z-[70] lead profile dialog. `AddTaskDialog` `DialogContent` (line 329) also has no z-index and no `hideOverlay`, so it opens behind the lead profile or creates a blocking overlay. |
| 6 | Activity log shows "View lead" instead of "View task" for KIT touch edit events | The `logTouchEdited` function passes `linkedTaskId` which maps to `relatedEntityType: 'task'`. However, the activity log item checks `activity.related_entity_type === 'task'` to show "View task" via `handleViewRelatedEntity` (line 98-100), BUT line 227 also checks `activity.related_entity_type !== 'task'` to show the "View lead/entity" link. The problem is that `taskId` from `activity.metadata?.task_id` (line 114) is used for the explicit "View Task" button. If `task_id` is not in metadata for older entries or the logTouchEdited doesn't store it in metadata, the button won't show. Looking at the code: `logTouchEdited` passes `metadata: { method, task_id: linkedTaskId }` - this should work. The issue is likely that existing activity log entries were created BEFORE this fix, so they don't have `task_id` in metadata. For the screenshot, the "Call touch updated" entry shows "View lead" because `related_entity_type` is still 'lead' (the `linkedTaskId` was likely null/undefined when the touch was edited). |
| 7 | KIT Activation dialog scroll still not working | The `hideOverlay` div (dialog.tsx line 36-42) uses `onWheel` with `stopPropagation()` but this div is a sibling of the content, not a parent. The wheel events on the dialog content don't pass through this div. The real fix: the dialog content itself needs to properly trap scroll. The issue is that `hideOverlay` removes the overlay (which normally handles pointer/scroll trapping in Radix), and the replacement div doesn't actually help. The fix should be to make the `DialogContent` itself handle scroll properly. |
| 8 | Bulk edit task type shows only KIT types | `uniqueTypes` (line 461) is `[...new Set(transformedTasks.map(task => task.type))]` - it shows only types that exist in current tasks. If the only tasks are KIT tasks, only KIT types appear. Should use `ALL_TASK_TYPES` for the bulk type dropdown. |
| 9 | Bulk action dialog cancel causes scroll to stop + can't uncheck tasks | The bulk action dialog (line 1446) is a regular `Dialog` with no z-index. When opened and closed, it may interfere with the page scroll because the overlay isn't properly cleaned up when multiple dialogs interact. Also, closing the dialog doesn't clear `selectedTasks`. |

---

## Technical Implementation

### Fix 1: Custom Cycle Restart - Store Touch Sequence on Subscription

The root cause: custom sequences are never persisted. When restarting a cycle, `createNextCycleMutation` reads from `preset.touch_sequence` which is null for custom sequences.

**Solution:** Store the custom touch sequence directly on the `kit_subscriptions` table in a `custom_touch_sequence` JSONB column. On cycle restart, check `custom_touch_sequence` if no preset exists.

**Files:**
- Database migration: Add `custom_touch_sequence` JSONB column to `kit_subscriptions`
- `useKitSubscriptions.ts`: Store `customSequence` in `custom_touch_sequence` during activation. In `createNextCycleMutation`, fall back to `subscription.custom_touch_sequence` when no preset.
- `kitConstants.ts`: Add `custom_touch_sequence` to `KitSubscription` interface

### Fix 2: KIT Cancel Deletes Linked Tasks/Reminders

**File:** `useKitSubscriptions.ts` - `cancelMutation`

Before updating subscription status to 'cancelled', query all touches for this subscription that have `linked_task_id` or `linked_reminder_id`. Delete/cancel those tasks and reminders.

```typescript
// In cancelMutation, before status update:
const { data: touchesWithLinks } = await supabase
  .from('kit_touches')
  .select('linked_task_id, linked_reminder_id')
  .eq('subscription_id', subscriptionId);

if (touchesWithLinks) {
  const taskIds = touchesWithLinks.map(t => t.linked_task_id).filter(Boolean);
  const reminderIds = touchesWithLinks.map(t => t.linked_reminder_id).filter(Boolean);
  if (taskIds.length > 0) {
    await supabase.from('tasks').delete().in('id', taskIds);
  }
  if (reminderIds.length > 0) {
    await supabase.from('reminders').delete().in('id', reminderIds);
  }
}
```

### Fix 3: Address Link for Visit/Meeting

**File:** `KitTouchCard.tsx`

Change the address fallback (lines 150-159) from plain text to a clickable Google Maps link:
```tsx
if (entityAddress) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entityAddress)}`;
  return (
    <span className="font-medium">
      {label}{' '}
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-1">
        <MapPin className="h-3 w-3 inline mr-0.5" />
        {entityAddress.length > 30 ? entityAddress.slice(0, 30) + '...' : entityAddress}
      </a>
    </span>
  );
}
```

Same for `renderContactLinks()` (lines 195-199).

### Fix 4: Touch Edit Task/Reminder Sync Verification

The code at `KitProfileTab.tsx` lines 477-504 already syncs `due_time` and `reminder_datetime`. The issue is that `editingTouch.linked_task_id` may be null for touches created before per-touch task creation was implemented.

**Verify:** Add console.log to track if `linked_task_id` is actually populated. If null, the sync silently does nothing. No code change needed if the touch was created with task linking enabled - the existing code is correct.

### Fix 5: Fix Filter/Add Task Inside Lead Profile

**File:** `LeadTasksTab.tsx`
- Line 184: Add `className="z-[100]"` to `SelectContent` for the filter dropdown
- The `AddTaskDialog` and `EditTaskDialog` opened from lead profile need `hideOverlay` and proper z-index

**File:** `AddTaskDialog.tsx`
- Line 329: Add `z-[100]` to `DialogContent` and add `hideOverlay`

**File:** `EditTaskDialog.tsx`
- Line 467: Change `z-[70]` to `z-[100]` and add `hideOverlay` when opened from within another dialog

Since we can't pass `hideOverlay` conditionally based on context, the safest approach: always add `hideOverlay` to both `AddTaskDialog` and `EditTaskDialog` `DialogContent` components, and increase their z-index to `z-[100]`.

### Fix 6: Activity Log "View Task" for KIT Events

The code in `ActivityLogItem.tsx` already handles this (lines 201-210). The "View Task" button shows when `taskId = activity.metadata?.task_id` exists. The issue is that existing activity log entries were created before the `task_id` metadata was added.

For new entries, the `logTouchEdited` function already stores `task_id: linkedTaskId` in metadata. No code change needed for new entries. Old entries will still show "View lead".

Also need to make sure that when `related_entity_type` is 'task', it also shows "View task" via the related entity link (currently line 227-238 excludes tasks from this section, which is correct since line 201-210 handles it via metadata).

### Fix 7: Dialog Scroll Fix

**Root cause:** The `hideOverlay` approach adds a sibling `div` that captures wheel events, but this div sits BEHIND the dialog content (same z-index), so wheel events on the content never reach it. The content itself doesn't prevent scroll from propagating to the body.

**Fix approach:** Remove the sibling div. Instead, use `modal={true}` (Radix default) which provides proper scroll trapping. The overlay stacking issue was the original reason for `hideOverlay` - fix this by making the overlay transparent for nested dialogs.

Alternative simpler fix: Keep `hideOverlay` but add `onWheel` handler directly on the `DialogContent` element to prevent body scroll, and add CSS `overflow-y: auto` to ensure the content is scrollable.

**File:** `dialog.tsx`
- Remove the sibling div (lines 36-42)
- On the `DialogPrimitive.Content` element, when `hideOverlay` is true, add an `onWheel` handler and ensure the element has `overflow-y: auto` to be scrollable

Actually, the simplest and most reliable fix: For the KIT Activation dialog specifically, wrap the scrollable content in a div with `onWheel={(e) => e.stopPropagation()}` and ensure `overflow-y: auto`. The dialog itself should use `modal={true}` (default).

**File:** `KitActivationDialog.tsx`
- Remove `hideOverlay` from DialogContent
- Add back the standard overlay (which provides scroll trapping)
- Since this dialog is opened from KitProfileTab which is inside a LeadDetailView/CustomerDetailView (z-70), the KIT dialog at z-100 will stack properly over it
- The overlay from the KIT dialog will add a second dark layer - to prevent this, use `hideOverlay` but fix the scroll differently

Better approach for `dialog.tsx`: When `hideOverlay` is true, instead of the sibling div, add a transparent overlay that still blocks body scroll:
```tsx
{hideOverlay && (
  <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent" />
)}
```
This uses Radix's own overlay which properly handles scroll blocking, but is transparent so no visual stacking.

### Fix 8: Bulk Edit Task Type Shows All Types

**File:** `EnhancedTaskTable.tsx`

Line 1505-1508: Replace `uniqueTypes` with `ALL_TASK_TYPES` for the bulk type change dropdown:
```tsx
import { ALL_TASK_TYPES } from "@/constants/taskConstants";
// ...
{bulkActionType === "type" && (
  <SelectContent>
    {ALL_TASK_TYPES.map(type => (
      <SelectItem key={type} value={type}>{type}</SelectItem>
    ))}
  </SelectContent>
)}
```

### Fix 9: Bulk Action Dialog Cleanup

**File:** `EnhancedTaskTable.tsx`

- Line 1447: Add `z-[60]` to bulk action `DialogContent` to ensure it appears properly
- The `onOpenChange` handler for the bulk action dialog should NOT clear selected tasks when closing - only clear them after a successful action. Currently the cancel button (line 1555) doesn't clear `selectedTasks`, which is correct. But the `Dialog` `onOpenChange` at line 1446 just toggles `bulkActionDialogOpen` without side effects, so selected tasks persist after cancel. The "can't uncheck" issue is likely related to scroll/pointer events being blocked after the dialog closes.

The scroll stopping after dialog cancel is the same root issue as Fix 7 - the overlay cleanup. Adding proper z-index to the dialog should help.

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `custom_touch_sequence` JSONB column to `kit_subscriptions` |
| `src/components/ui/dialog.tsx` | Fix `hideOverlay` to use transparent Radix overlay for proper scroll blocking |
| `src/hooks/useKitSubscriptions.ts` | Store custom sequence on activation; read it for cycle restart; delete linked tasks/reminders on cancel |
| `src/constants/kitConstants.ts` | Add `custom_touch_sequence` and `skip_weekends` to `KitSubscription` interface |
| `src/components/kit/KitTouchCard.tsx` | Make address a clickable Google Maps link |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Add `z-[100]` to filter `SelectContent` |
| `src/components/tasks/AddTaskDialog.tsx` | Add `z-[100]` and `hideOverlay` to `DialogContent` |
| `src/components/tasks/EditTaskDialog.tsx` | Keep `hideOverlay` and ensure z-[100] |
| `src/components/tasks/EnhancedTaskTable.tsx` | Use `ALL_TASK_TYPES` for bulk type change; add z-index to bulk dialog |
| `src/components/kit/KitActivationDialog.tsx` | Remove broken scroll workarounds, rely on fixed dialog.tsx |

## Implementation Order

1. Database migration (add `custom_touch_sequence` column)
2. Fix `dialog.tsx` scroll (transparent overlay for `hideOverlay`)
3. Fix `useKitSubscriptions.ts` (store custom sequence, cycle restart, cancel cleanup)
4. Fix `kitConstants.ts` interface
5. Fix nested dialog z-indexes (LeadTasksTab, AddTaskDialog, EditTaskDialog)
6. Fix address link in KitTouchCard
7. Fix bulk edit type dropdown in EnhancedTaskTable
8. Clean up KitActivationDialog
