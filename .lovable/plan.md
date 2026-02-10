

# Comprehensive Fix: Layering, Display, and Integration Issues

## Root Cause: The Recurring Overlay/Layering Problem

The core issue causing gray-to-black backgrounds and hidden dialogs is in `dialog.tsx`. Every `<DialogContent>` renders its own `<DialogOverlay>` hardcoded at `z-50 bg-black/80`. When dialogs are nested (e.g., Lead Profile z-[70] opens Task Detail z-[80] opens Edit Dialog z-[100]), each creates a **new dark overlay at z-50**, stacking multiple semi-transparent black layers and making the screen progressively darker/blacker.

The permanent fix is to modify `dialog.tsx` so the overlay inherits the z-index from its content, and to ensure nested dialogs opened from within other dialogs use `modal={false}` to avoid adding extra overlays on top of already-open dialogs.
also address if there is a loop like when the task is opened from lead information window and lead profile is opened from the task profile window. 

---

## Issues & Fixes

### 1. Dialog Overlay Stacking (THE ROOT FIX)

**Problem:** `DialogOverlay` is always `z-50 bg-black/80`. With 3 nested dialogs, you get 3 overlays = nearly opaque black.

**Fix:** Modify `dialog.tsx` to accept an optional `overlayClassName` prop so each dialog layer can control its overlay's z-index. Additionally, for dialogs that open on top of other dialogs (KIT dialogs, Task detail, entity profiles from Task detail), use `modal={false}` on the inner dialog to prevent creating additional overlay layers.

**Files:** `src/components/ui/dialog.tsx`

Changes:
- Add a `modal` prop pass-through pattern so nested dialogs don't spawn extra overlays
- The content z-index already works; the issue is purely the overlay accumulation

For the specific components:
- `KitActivationDialog`, `AddTouchDialog`, `EditTouchDialog`, `KitTouchCompleteDialog`, `KitPauseDialog`, `KitCycleCompleteDialog` -- all opened from within LeadDetailView (z-[70]), so they should use `modal={false}` on their `<Dialog>` to avoid additional overlays
- `TaskDetailView` when opened from within LeadDetailView should also not add another overlay
- `LeadDetailView` / `CustomerDetailView` when opened from within TaskDetailView should also not add another overlay

### 2. KIT Activation Missing Task/Reminder Option

**Problem:** When first activating KIT, there's no option to create a task and reminder (unlike AddTouchDialog).

**Fix:** Add the same task/reminder creation section from `AddTouchDialog` to `KitActivationDialog`, including:
- "Create Task" checkbox
- Task title input
- "Create Reminder" checkbox

**File:** `src/components/kit/KitActivationDialog.tsx`

The `onActivate` callback signature needs to be extended to include `createTask`, `taskTitle`, and `createReminder` parameters, and `KitProfileTab.tsx` `handleActivate` needs to handle creating the task/reminder after activation completes.

### 3. Task Tab "Assigned To" Showing Email

**Problem:** In `LeadTasksTab.tsx`, line 284 renders `{task.assigned_to}` directly -- raw email.

**Fix:** Import `useActiveStaff` and `getStaffDisplayName`, and replace `{task.assigned_to}` with `{getStaffDisplayName(task.assigned_to, staffMembers)}`.

**File:** `src/components/leads/detail-tabs/LeadTasksTab.tsx` (line 284)

### 4. Task Detail Window "Assigned To" and "Created By" Showing Email

**Problem:** In `TaskDetailView.tsx`, line 405 renders `<ValueRow label="Assigned to" value={task.assigned_to} />` -- raw email. Same for `created_by` on line 429.

**Fix:** Import and use `getStaffDisplayName` for both fields.

**File:** `src/components/tasks/TaskDetailView.tsx` (lines 405, 429)

### 5. Activity Log Showing Email

**Problem:** Activity log entries show raw email for the actor/assignee.

**Fix:** Wherever activity log entries display `assigned_to` or `created_by`, apply `getStaffDisplayName`.

**Files:** Activity log rendering components (need to check `ActivityLogItem.tsx`)

### 6. Touch Edit Not Syncing to Linked Task

**Problem:** When a touch is edited, the associated task's due_date and assigned_to are not updated.

**Fix:** This requires:
1. A DB migration to add `linked_task_id` and `linked_reminder_id` columns to `kit_touches`
2. Update `handleAddTouch` in `KitProfileTab.tsx` to store the task/reminder IDs after creation
3. Update `handleEditTouch` to also update the linked task when touch date/assignee changes

**Files:** `KitProfileTab.tsx`, DB migration

### 7. Calendar Month View Only Half Visible

**Problem:** The month grid has `flex-1` but the parent `CardContent` has `overflow-hidden` and the grid may not get enough height.

**Fix:** Add `overflow-y-auto` to the calendar grid container and ensure proper `min-h` so all weeks are visible.

**File:** `src/components/calendar/CalendarMonthView.tsx`

### 8. Send Notification "Specific User" Should Be Dropdown

**Problem:** When "Specific User" is selected in automation notification action, it shows a text input instead of a staff dropdown.

**Fix:** Replace the `<Input>` for `specific_users` with a staff multi-select using `useActiveStaff` and `buildStaffGroups`.

**File:** `src/components/automation/actions/SendNotificationActionConfig.tsx`

### 9. Visit/Meeting Touch Not Hyperlinking to Address

**Problem:** The `renderMethodWithLink()` and `renderContactLinks()` in `KitTouchCard.tsx` check for `entityLocation` but the visit method only links to PlusCodeLink. If there's no plus code but there IS an address, it should fall back to linking to the profile tab.

**Fix:** Update the visit handler in `renderMethodWithLink()` to handle both plus code and address scenarios. When neither is available, add an `onClick` that navigates to the entity's profile tab.

**File:** `src/components/kit/KitTouchCard.tsx`

### 10. Task Title Click in Task Management Not Working

**Problem:** Looking at the code, the task title click handler in `EnhancedTaskTable.tsx` (line 936-939) correctly calls `openTask(task.id)`. This should work. The issue may be that `openTask` opens `TaskDetailView` but with the lead profile already open, the overlay stacking makes it appear unresponsive.

**Fix:** This is resolved by Fix #1 (the overlay stacking fix).

---

## Technical Implementation

### dialog.tsx Changes
The key change is allowing nested dialogs to not produce additional overlays. Radix `Dialog.Root` accepts a `modal` prop -- when set to `false`, it won't render an overlay or trap focus. We'll use this for all child dialogs.

### Z-Index Hierarchy (Final, Definitive)

```text
Layer 0: App content - z-auto
Layer 1: Base dialog overlays - z-[50] (from dialog.tsx)  
Layer 2: Entity profiles (Lead/Customer) - z-[70]
Layer 3: Task Detail (global modal) - z-[80]
Layer 4: Entity profiles from Task Detail - z-[90]
Layer 5: Action dialogs (KIT, Edit, Complete) - z-[100]  
Layer 6: Select/Popover dropdowns - z-[200]
```

The fix: dialogs at Layer 5 that open ON TOP of Layer 2 dialogs must use `modal={false}` to avoid extra overlays.

### DB Migration for Touch-Task Linking

```sql
ALTER TABLE kit_touches 
ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS linked_reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL;
```

---

## Files to Modify

| File | Changes | Issues Fixed |
|------|---------|-------------|
| `src/components/ui/dialog.tsx` | No changes needed -- we'll use `modal={false}` on individual Dialog instances | #1 |
| `src/components/kit/KitActivationDialog.tsx` | Add `modal={false}`, add task/reminder creation | #1, #2 |
| `src/components/kit/AddTouchDialog.tsx` | Add `modal={false}` | #1 |
| `src/components/kit/EditTouchDialog.tsx` | Add `modal={false}` | #1 |
| `src/components/kit/KitTouchCompleteDialog.tsx` | Add `modal={false}` | #1 |
| `src/components/kit/KitPauseDialog.tsx` | Add `modal={false}` | #1 |
| `src/components/kit/KitCycleCompleteDialog.tsx` | Add `modal={false}` | #1 |
| `src/components/tasks/TaskDetailView.tsx` | Use `getStaffDisplayName` for assigned_to/created_by; nested entity views use `modal={false}` | #1, #4 |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Use `getStaffDisplayName` for assigned_to column | #3 |
| `src/components/kit/KitProfileTab.tsx` | Handle activation with task creation; handle touch-task sync on edit | #2, #6 |
| `src/components/kit/KitTouchCard.tsx` | Improve visit/meeting fallback navigation | #9 |
| `src/components/calendar/CalendarMonthView.tsx` | Fix height/overflow for full month visibility | #7 |
| `src/components/automation/actions/SendNotificationActionConfig.tsx` | Replace text input with staff dropdown | #8 |
| `src/components/leads/activity/ActivityLogItem.tsx` | Use `getStaffDisplayName` for assignee display | #5 |
| DB Migration | Add linked_task_id, linked_reminder_id to kit_touches | #6 |

---

## Implementation Order

1. Fix the overlay stacking (modal={false} on all nested dialogs) -- fixes issues #1, #10
2. Staff display name fixes (LeadTasksTab, TaskDetailView, ActivityLogItem) -- fixes #3, #4, #5
3. KIT activation task/reminder creation -- fixes #2
4. Touch-task sync on edit (DB migration + handler update) -- fixes #6
5. Calendar month view height fix -- fixes #7
6. Send notification staff dropdown -- fixes #8
7. Visit/meeting touch hyperlink fallback -- fixes #9

