

# Comprehensive Fix Plan: KIT Module, Task System, and UI Issues

## Issues Identified and Root Causes

### 1. KIT Activation Dialog Scroll Not Working
**Root Cause:** `modal={false}` on the Dialog prevents Radix from managing focus/scroll trapping. The `overflow-y-auto` on `DialogContent` works for manual drag but mouse wheel events pass through to the background.
**Fix:** Change `KitActivationDialog` back to `modal={true}` but use a custom approach - since the real layering fix should happen in `dialog.tsx` itself. The proper fix: keep `modal={false}` but add `onWheel` event capture or add `pointer-events-auto` and `overscroll-behavior: contain` CSS to the scrollable content area.

### 2. Visit/Meeting Touch Shows Plus Code as Touch Name
**Root Cause:** In `KitTouchCard.tsx` line 140-142, when `entityLocation` exists for visit/meeting, it renders `<PlusCodeLink plusCode={entityLocation} />` which displays the plus code string as the link text (line 68 of PlusCodeLink.tsx: `{plusCode}`).
**Fix:** Change to show the method label ("Site Visit" / "Meeting") as the visible text with a small map icon/link, instead of replacing the name with the raw plus code.

### 3. KIT Activation Creates Only 1 Task/Reminder Instead of Per-Touch
**Root Cause:** In `KitProfileTab.tsx` `handleActivate` (lines 147-186), task/reminder creation only happens once for a single generic "follow-up" task. There's no loop over the touch sequence. The activation creates all touches in `useKitSubscriptions.ts` but the task/reminder logic in `handleActivate` doesn't iterate over them.
**Fix:** After activation, query all created touches for the subscription, then create a task and reminder for EACH touch, storing the `linked_task_id` and `linked_reminder_id` on each touch record.

### 4. Custom Touch Sequence Builder Broken (Dropdowns, Rearranging)
**Root Cause:** `KitTouchSequenceBuilder.tsx` uses `<Select>` components without `z-[200]` on `<SelectContent>`, so they render behind the activation dialog (z-[100]). The drag handle has no actual drag-and-drop functionality (just a visual icon with `cursor-grab`), and movement buttons (up/down) are missing.
**Fix:** Add `z-[200]` to all `SelectContent` elements. Replace the non-functional drag handle with up/down arrow buttons that call the existing `moveTouch()` function.

### 5. KIT Save/Activation Error
**Root Cause:** Likely caused by the task/reminder creation logic failing (e.g., missing required fields or linked_task_id column not being recognized in the type system). The `linked_task_id` and `linked_reminder_id` columns were added via migration but the Supabase types may not have updated properly, or the `addTask` return value isn't being captured to store the ID.
**Fix:** Ensure robust error handling around task/reminder creation so it doesn't block KIT activation. Use `try/catch` around task creation within the activation flow.

### 6. System Unresponsive on Task Deletion from Lead Profile
**Root Cause:** In `LeadTasksTab.tsx` line 157-163, `handleDeleteConfirm` calls `deleteTask` then immediately sets state. The `deleteTask` in `useTasks` likely triggers a cascade query invalidation that causes the entire task list to refetch, and if the lead profile dialog is also re-rendering, it creates a loop. Also, the `AlertDialogContent` for delete confirmation lacks a z-index class, so it may be hidden.
**Fix:** Add `z-[100]` to the delete confirmation `AlertDialogContent`. Add error handling with `try/catch` around `deleteTask`. Ensure state cleanup happens in a `.finally()` block.

### 7. KIT Task Types Mismatch (5 touch types vs 3 KIT task types)
**Root Cause:** `KIT_TASK_TYPES` in `taskConstants.ts` only has 3 entries: "KIT Follow-up", "KIT Relationship Check", "KIT Touch Reminder". The 5 touch methods are: Call, WhatsApp, Visit, Email, Meeting.
**Fix:** Update `KIT_TASK_TYPES` to mirror the 5 touch methods: "KIT Call", "KIT WhatsApp", "KIT Visit", "KIT Email", "KIT Meeting". Update the control panel defaults accordingly.

### 8. Edit Task Dialog "Assigned To" Shows Blank
**Root Cause:** In `EditTaskDialog.tsx` line 116, `formData.assignedTo` is initialized from `taskData.assigned_to` which stores an **email** (e.g., "user@example.com"). But the Select options use `value={member.name}` (line 551). Since email !== name, no option matches and the field shows blank.
**Fix:** Change the Select options to use `value={member.email || member.id}` instead of `value={member.name}`, and display `member._display` (Role - Name format) as the label. This matches how all other staff dropdowns work across the system.

### 9. Touch Edit Not Syncing to Linked Task/Reminder
**Root Cause:** In `KitProfileTab.tsx` `handleEditTouch` (lines 412-426), the sync uses `(editingTouch as any).linked_task_id` but the `touchesQuery` in `useKitTouches.ts` does `select('*')` which should include `linked_task_id`. However, the `KitTouch` TypeScript interface in `kitConstants.ts` does NOT have `linked_task_id` or `linked_reminder_id` fields, so the cast to `KitTouch` type loses those fields. Additionally, reminder sync is completely missing.
**Fix:** Add `linked_task_id` and `linked_reminder_id` to the `KitTouch` interface. Add reminder sync logic alongside the task sync in `handleEditTouch`.

### 10. Dialog `modal={false}` Causing Scroll and Interaction Issues
**Root Cause:** When `modal={false}` is set on Radix Dialog, it stops rendering the overlay AND stops trapping pointer events/scroll. This is why the activation dialog can't detect scroll - pointer events pass through to the underlying page. However, `modal={true}` would add another overlay layer causing the black screen issue.
**Fix:** The correct approach is to keep `modal={true}` (default) for ALL dialogs but modify `dialog.tsx` so that when a dialog has a custom z-index class on its content, the overlay is conditionally rendered only for the first/base dialog. For nested dialogs, we'll suppress the overlay by adding a prop `hideOverlay` to `DialogContent`.

---

## Technical Implementation

### Phase 1: Fix dialog.tsx to Support Nested Dialogs Without Overlay Stacking

Modify `dialog.tsx` to add a `hideOverlay` variant. When `hideOverlay` is true, the overlay is not rendered. All nested dialogs (KIT dialogs, EditTask from LeadProfile, etc.) will use this variant. Remove `modal={false}` from all dialogs (restoring proper scroll/interaction).

```tsx
// dialog.tsx - Add hideOverlay support
const DialogContent = React.forwardRef<...>(
  ({ className, children, hideOverlay, ...props }, ref) => (
    <DialogPortal>
      {!hideOverlay && <DialogOverlay />}
      <DialogPrimitive.Content ...>
        {children}
        <DialogPrimitive.Close .../>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
)
```

Then all nested dialogs change from `modal={false}` + `<Dialog>` to regular `<Dialog>` + `<DialogContent hideOverlay>`.

### Phase 2: Fix Touch Card Display

In `KitTouchCard.tsx` `renderMethodWithLink()`, for visit/meeting:
```tsx
if (touch.method === 'visit' || touch.method === 'meeting') {
  const label = touch.method === 'visit' ? 'Site Visit' : 'Meeting';
  if (entityLocation) {
    return (
      <span className="font-medium">
        {label}{' '}
        <PlusCodeLink plusCode={entityLocation} className="text-xs ml-1" />
      </span>
    );
  }
  return <span className="font-medium">{label}</span>;
}
```

### Phase 3: Fix KIT Activation to Create Task/Reminder Per Touch

Update `handleActivate` in `KitProfileTab.tsx`:
1. After `activateKit()` returns, query all newly created touches for the subscription
2. For each touch, create a task with the touch method as type (e.g., "KIT Call")
3. Create reminder if requested
4. Update each touch record with `linked_task_id` and `linked_reminder_id`

### Phase 4: Fix Custom Touch Sequence Builder

In `KitTouchSequenceBuilder.tsx`:
- Add `className="z-[200]"` to all `<SelectContent>` elements
- Replace visual-only `GripVertical` with up/down arrow buttons

### Phase 5: Fix KIT Task Types

Update `taskConstants.ts`:
```typescript
export const KIT_TASK_TYPES = [
  "KIT Call",
  "KIT WhatsApp", 
  "KIT Visit",
  "KIT Email",
  "KIT Meeting"
];
```

### Phase 6: Fix Edit Task Assigned To

In `EditTaskDialog.tsx` line 551, change:
```tsx
// FROM
<SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
// TO
<SelectItem key={member.id} value={member.email || member.id}>{member._display}</SelectItem>
```
Same fix needed in `AddTaskDialog.tsx`.

### Phase 7: Fix Touch-Task/Reminder Sync

Update `KitTouch` interface in `kitConstants.ts` to include `linked_task_id` and `linked_reminder_id`. Update `handleEditTouch` to also sync the linked reminder.

### Phase 8: Fix Task Deletion

Add `z-[100]` to delete confirmation dialog and wrap delete in try/catch.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/dialog.tsx` | Add `hideOverlay` prop to `DialogContent` |
| `src/components/kit/KitActivationDialog.tsx` | Remove `modal={false}`, use `hideOverlay`, fix per-touch task creation |
| `src/components/kit/AddTouchDialog.tsx` | Remove `modal={false}`, use `hideOverlay` |
| `src/components/kit/EditTouchDialog.tsx` | Remove `modal={false}`, use `hideOverlay` |
| `src/components/kit/KitTouchCompleteDialog.tsx` | Remove `modal={false}`, use `hideOverlay` |
| `src/components/kit/KitPauseDialog.tsx` | Remove `modal={false}`, use `hideOverlay` |
| `src/components/kit/KitTouchCard.tsx` | Fix visit/meeting label display |
| `src/components/kit/KitProfileTab.tsx` | Per-touch task/reminder creation on activation, reminder sync on edit |
| `src/components/kit/presets/KitTouchSequenceBuilder.tsx` | Add z-[200] to SelectContent, add move buttons |
| `src/constants/kitConstants.ts` | Add `linked_task_id` and `linked_reminder_id` to `KitTouch` interface |
| `src/constants/taskConstants.ts` | Update KIT_TASK_TYPES to 5 types matching touch methods |
| `src/components/tasks/EditTaskDialog.tsx` | Fix assigned_to value to use email, display _display |
| `src/components/tasks/AddTaskDialog.tsx` | Fix assigned_to value to use email for consistency |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Add z-[100] to delete dialog, error handling |
| `src/hooks/useControlPanelSettings.ts` | Update KIT task type defaults |

