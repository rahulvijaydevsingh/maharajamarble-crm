
# Fix Plan: Time Sync, Task Titles, Skip Cleanup, Delete Removal, and Staff Error

## Issues Identified

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Touch time 4:05 PM creates reminder at 9:35 PM | Reminder datetime is built as `${date}T${time}:00` without timezone offset. This gets stored as UTC in the database. A user in IST setting 16:05 gets it stored as 16:05 UTC, which displays as 21:35 IST (9:35 PM). The fix: convert local time to proper ISO string using JavaScript Date. |
| 2 | Task title format wrong | Currently creates `KIT Call with {name}`. User wants `KIT for - {name} - Call`. |
| 3 | Delete button causes cycle-complete confusion | Deleting touches directly bypasses the cycle-complete check. User wants delete removed; skip and cancel should handle cleanup instead. |
| 4 | Skip touch doesn't delete linked task/reminder | `skipMutation` in `useKitTouches.ts` only updates status to 'skipped'. It never cleans up the linked task and reminder. |
| 5 | Activity log shows "View lead" instead of "View task" | For touches created BEFORE the linking fix, `linked_task_id` is null, so `metadata.task_id` is undefined and "View Task" button doesn't appear. New touches (created with the fixed linking) will correctly show "View Task". No code fix needed -- this is a data issue for old entries. |
| 6 | Staff creation error message unhelpful | `supabase.functions.invoke` returns generic "Edge Function returned a non-2xx status code" but the actual error message is in the response body. The invoke call doesn't extract the body error. |

## Technical Changes

### 1. Fix Reminder Datetime Timezone (KitProfileTab.tsx)

In both `handleActivate` (line 202) and `handleAddTouch` (line 413), the reminder datetime is constructed as a naive string:
```
`${date}T${time}:00`
```

This is treated as UTC by the database. The fix: use `new Date()` to properly convert local time to ISO:

```typescript
// Instead of:
reminder_datetime: `${date}T${time || '09:00'}:00`
// Use:
reminder_datetime: new Date(`${date}T${time || '09:00'}`).toISOString()
```

This ensures the browser's local timezone is used for the conversion, so 4:05 PM IST becomes the correct UTC equivalent.

Same fix needed in `handleEditTouch` (line 519).

**Files:** `src/components/kit/KitProfileTab.tsx` (3 locations)

### 2. Fix Task Title Format (KitProfileTab.tsx)

Change the `getKitTaskType` mapping and the title construction.

Current: `KIT Call with {entityName}`
New: `KIT for - {entityName} - Call`

The method label mapping:
- call -> Call
- whatsapp -> WhatsApp
- visit -> Site Visit
- email -> Email
- meeting -> Meeting

Update `handleActivate` (line 179) and `handleAddTouch` (line 393) title construction.

**Files:** `src/components/kit/KitProfileTab.tsx`, `src/components/kit/AddTouchDialog.tsx`

### 3. Remove Delete Button, Add Cleanup to Skip

**Remove delete button from KitTouchCard.tsx:**
- Remove the `onDelete` prop usage and the Trash2 delete button (lines 326-336)
- Remove `onDelete` from the interface (line 47)

**Remove delete handler from KitProfileTab.tsx:**
- Remove `handleDeleteTouch` function (lines 543-546)
- Remove `onDelete` prop from all `KitTouchCard` usages (lines 725, 785)
- Remove `deleteTouch` and `isDeleting` from the hook destructure

**Add linked task/reminder cleanup to skipMutation in useKitTouches.ts:**
Before updating status to 'skipped', fetch and delete `linked_task_id` and `linked_reminder_id`:

```typescript
// In skipMutation, before status update:
const { data: touchData } = await supabase
  .from('kit_touches')
  .select('linked_task_id, linked_reminder_id')
  .eq('id', touchId)
  .single();

if (touchData?.linked_task_id) {
  await supabase.from('tasks').delete().eq('id', touchData.linked_task_id);
}
if (touchData?.linked_reminder_id) {
  await supabase.from('reminders').delete().eq('id', touchData.linked_reminder_id);
}
```

**Files:** `src/components/kit/KitTouchCard.tsx`, `src/components/kit/KitProfileTab.tsx`, `src/hooks/useKitTouches.ts`

### 4. Fix Staff Creation Error Handling (useStaffManagement.ts)

The current code throws "Edge Function returned a non-2xx status code" because it reads `error.message`. The actual error message is in the response data. Update to extract the body:

```typescript
const { data: result, error } = await supabase.functions.invoke("create-staff-user", { body: {...} });

if (error) {
  // Try to get the actual error message from the response
  const errorBody = result?.error || error.message;
  throw new Error(errorBody);
}
```

Actually, when `supabase.functions.invoke` returns a non-2xx, `data` is null and `error` is a `FunctionsHttpError`. The response body is accessible via `error.context`. The fix:

```typescript
if (error) {
  let msg = error.message;
  try {
    const body = await error.context?.json();
    if (body?.error) msg = body.error;
  } catch {}
  throw new Error(msg);
}
```

**File:** `src/hooks/useStaffManagement.ts`

### 5. Add Invalidation for Tasks/Reminders on Skip

After skip deletes linked records, invalidate task and reminder queries:

```typescript
onSuccess: (result) => {
  queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
  queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['reminders'] });
  toast({ title: 'Touch skipped' });
},
```

**File:** `src/hooks/useKitTouches.ts`

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/kit/KitProfileTab.tsx` | Fix reminder datetime timezone (3 places); fix task title format; remove delete handler and delete prop from touch cards |
| `src/components/kit/KitTouchCard.tsx` | Remove delete button and `onDelete` prop |
| `src/components/kit/AddTouchDialog.tsx` | Update default task title format |
| `src/hooks/useKitTouches.ts` | Add task/reminder cleanup to skipMutation; add query invalidation |
| `src/hooks/useStaffManagement.ts` | Extract actual error message from edge function response |

## Implementation Order

1. Fix timezone handling in reminder datetime
2. Fix task title format
3. Remove delete button, add cleanup to skip
4. Fix staff error message extraction
