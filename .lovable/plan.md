

# Fix Plan: KIT Scroll, Custom Activation, Time Sync, Address Fallback, and Activity Log

## Issues and Root Causes

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | KIT Activation dialog doesn't detect mouse scroll | `hideOverlay` removes the overlay but Radix Dialog still needs `modal={true}` (default) for scroll trapping. The issue is that `hideOverlay` prevents the overlay from rendering, but the dialog content needs `pointer-events-auto` and `overscroll-behavior: contain` to capture scroll within the scrollable area |
| 2 | Custom touch cycle gives error on save | `KitProfileTab.tsx` line 149: `presetId: presetId || ''` converts `null` to empty string `''`, which gets inserted into `preset_id` (a UUID FK column), causing a foreign key constraint violation |
| 3 | Touch edit updates date but not time on reminder and task  | `KitProfileTab.tsx` line 484: `reminder_datetime` is hardcoded to `T09:00:00` instead of using `data.scheduledTime`. Same hardcoded time on activation (line 197) |
| 4 | Visit/Meeting doesn't link to address when plus code unavailable | `KitProfileTab` only passes `entityLocation` (set from `site_plus_code`). No fallback to `address` field. `KitTouchCard` only handles `entityLocation`, not a separate `entityAddress` prop |
| 5 | Activity log shows emails instead of usernames | `useKitActivityLog.ts` line 14: `userName = user?.email` stores raw email. Also, description fields like "Reassigned to user@email.com" store raw email. The `ActivityLogItem.tsx` line 158 renders `activity.user_name` directly without staff lookup |
| 6 | Touch log shows "View lead" instead of related task | `useKitActivityLog.ts` sets `related_entity_type: entityType` (lead/customer) and `related_entity_id: entityId` for all KIT events, so the activity log renders "View lead" link. For task-related KIT events, it should link to the task instead |

---

## Fix Details

### Fix 1: KIT Activation Dialog Scroll

Add `pointer-events-auto` and `overscroll-behavior-y: contain` CSS to the scrollable `DialogContent` in `KitActivationDialog.tsx`. This ensures mouse wheel events are captured by the dialog content instead of passing through.

**File:** `src/components/kit/KitActivationDialog.tsx` (line 112)

Change:
```tsx
<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[100]" hideOverlay>
```
To:
```tsx
<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[100] pointer-events-auto" hideOverlay style={{ overscrollBehaviorY: 'contain' }}>
```

### Fix 2: Custom Sequence Activation Error

**File:** `src/components/kit/KitProfileTab.tsx` (line 149)

Change `presetId: presetId || ''` to `presetId: presetId || null` so that when custom mode sends `null`, it stays `null` (which the DB accepts for nullable UUID FK columns).

Also update `ActivateKitParams` in `useKitSubscriptions.ts` and the insert to use `preset_id: presetId || null` to ensure empty strings are never sent.

### Fix 3: Reminder Time Sync

**File:** `src/components/kit/KitProfileTab.tsx`

Two locations need fixing:
- Line 197 (activation): Change `\`${touch.scheduled_date}T09:00:00\`` to use the touch's scheduled_time if available, defaulting to 09:00
- Line 484 (edit sync): Change `\`${data.scheduledDate}T09:00:00\`` to `\`${data.scheduledDate}T${data.scheduledTime || '09:00'}:00\``

### Fix 4: Visit/Meeting Address Fallback

**Files:** `KitProfileTab.tsx`, `KitTouchCard.tsx`, `LeadDetailView.tsx`, `CustomerDetailView.tsx`

1. Add `entityAddress` prop to `KitProfileTabProps` and `KitTouchCardProps`
2. Pass `address` from Lead/Customer to `KitProfileTab` as `entityAddress`
3. In `KitTouchCard.tsx` `renderMethodWithLink()`, when `entityLocation` (plus code) is absent but `entityAddress` is present, create a Google Maps link from the address
4. Same in `renderContactLinks()`

### Fix 5: Activity Log Email-to-Name Resolution

**File:** `src/components/leads/activity/ActivityLogItem.tsx`

Import `useActiveStaff` and `getStaffDisplayName`, then:
- Line 158: Replace `{activity.user_name}` with `{getStaffDisplayName(activity.user_name, staffMembers)}`
- For description text containing emails (like "Reassigned to user@email.com"), parse metadata and display staff names

**File:** `src/hooks/useKitActivityLog.ts`

Update `logTouchReassigned` (line 129) to resolve `newAssignee` email to display name before storing in description. Import `useActiveStaff` at hook level and use it in the log functions.

### Fix 6: KIT Activity Log - Link to Task Instead of Lead

**File:** `src/hooks/useKitActivityLog.ts`

For task-related KIT events (`kit_task_created`, `kit_touch_completed`, `kit_touch_edited`, etc.), store the task ID in metadata and set `related_entity_type: 'task'` when a linked task exists.

Update the following log functions to accept optional `linkedTaskId` parameter:
- `logTouchCompleted` - set related entity to task if `linkedTaskId` provided
- `logTouchEdited` - same
- `logTaskCreatedFromKit` - store task ID in metadata as `task_id`

**File:** `src/components/kit/KitProfileTab.tsx`

Pass `touch.linked_task_id` to log functions when available.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/kit/KitActivationDialog.tsx` | Add `pointer-events-auto` + `overscrollBehaviorY: contain` |
| `src/components/kit/KitProfileTab.tsx` | Fix `presetId || ''` to `presetId || null`; fix reminder time sync; pass `entityAddress`; pass `linkedTaskId` to logs |
| `src/hooks/useKitSubscriptions.ts` | Ensure `preset_id: presetId || null` in insert |
| `src/components/kit/KitTouchCard.tsx` | Add `entityAddress` prop; address fallback for visit/meeting |
| `src/components/leads/LeadDetailView.tsx` | Pass `entityAddress={currentLead.address}` to KitProfileTab |
| `src/components/customers/CustomerDetailView.tsx` | Pass `entityAddress` to KitProfileTab |
| `src/components/leads/activity/ActivityLogItem.tsx` | Use `getStaffDisplayName` for `user_name` display |
| `src/hooks/useKitActivityLog.ts` | Store staff display names; link to task for KIT events |

## Implementation Order

1. Fix custom activation error (Fix 2) - prevents activation failures
2. Fix scroll (Fix 1) - simple CSS addition
3. Fix reminder time sync (Fix 3)
4. Fix address fallback (Fix 4)
5. Fix activity log emails (Fix 5)
6. Fix activity log task links (Fix 6)

