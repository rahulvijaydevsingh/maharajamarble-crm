
# KIT Module Modifications - Implementation Plan

## Overview

This plan addresses 10 modifications to the Keep in Touch (KIT) module to improve functionality, fix bugs, and enhance the user experience.

---

## Issue Summary

| # | Issue | Type |
|---|-------|------|
| 1 | Can only select presets, no custom/individual sequence creation | Feature |
| 2 | Cannot see/reassign touch assignee in upcoming section | Feature |
| 3 | Skip action not logged to activity log | Bug |
| 4 | All 3 buttons open same dialog, need direct reschedule option | UX |
| 5 | Cycle completion dialog not shown when skipping touches | Bug |
| 6 | Error editing preset: "cannot read properties of undefined" | Bug |
| 7 | Same error on any preset edit | Bug (same as #6) |
| 8 | Allow creating individual touch sequences per entity | Feature |
| 9 | Option to skip weekends (Sunday touches move to Monday) | Feature |
| 10 | Calendar shows entity ID instead of name, links not working | Bug |

---

## Technical Implementation

### Fix #1, #8: Custom Touch Sequences (Combined)

**Problem:** Currently, users can only select admin-created presets. They need the ability to create custom one-off touch sequences directly on entity profiles.

**Solution:** Add a "Create Custom Sequence" option in the KitActivationDialog that allows inline sequence building.

**Files to Modify:**
- `src/components/kit/KitActivationDialog.tsx`
  - Add tabs: "Use Preset" and "Create Custom"
  - Import and integrate `KitTouchSequenceBuilder` for custom mode
  - Handle activation without preset_id (store sequence directly or create temp preset)

- `src/hooks/useKitSubscriptions.ts`
  - Modify `activateMutation` to accept custom touch_sequence instead of preset_id
  - Store custom sequences with preset_id = null

**Schema Consideration:** No database changes needed. When preset_id is null, the touch sequence is stored directly on the subscription or inline touches are created without preset reference.

---

### Fix #2: Show Assignee and Allow Reassignment

**Problem:** Cannot see who is assigned to upcoming touches or reassign them.

**Solution:** Display assignee on touch cards and add reassign action.

**Files to Modify:**
- `src/components/kit/KitTouchCard.tsx`
  - Add `assigned_to` display with user icon
  - Add "Reassign" button that opens a staff selector popover
  - New prop: `onReassign?: (newAssignee: string) => void`

- `src/components/kit/KitProfileTab.tsx`
  - Pass `onReassign` handler to `KitTouchCard`
  - Implement reassign logic calling `useKitTouches` mutation

- `src/hooks/useKitTouches.ts`
  - Add `reassignTouchMutation` to update `assigned_to` field

---

### Fix #3: Log Skip Action to Activity

**Problem:** When a touch is skipped, it's not logged to the activity timeline.

**Solution:** Add activity logging for the skip action.

**Files to Modify:**
- `src/hooks/useKitActivityLog.ts`
  - Add `logTouchSkipped` helper function
  - New activity type: `kit_touch_skipped`

- `src/components/kit/KitProfileTab.tsx`
  - Modify `onSkip` handler to call `logTouchSkipped` after skip

- `src/constants/activityLogConstants.ts`
  - Add `kit_touch_skipped` to activity types with appropriate icon

---

### Fix #4: Separate Reschedule Button

**Problem:** All three action buttons (Complete, Snooze, Reschedule) open the same "Log Touch Outcome" dialog. Users want direct reschedule access.

**Solution:** Restructure the touch card buttons:
1. **Log** button - Opens outcome dialog (primary action)
2. **Snooze** button - Shows quick snooze dropdown (1h, 2h, 4h, Tomorrow)
3. **Reschedule** button - Opens date picker directly

**Files to Modify:**
- `src/components/kit/KitTouchCard.tsx`
  - Replace single dialog trigger with distinct actions
  - Snooze: Add dropdown with snooze options
  - Reschedule: Add calendar popover for date selection
  - New props: `onDirectSnooze`, `onDirectReschedule`

- `src/components/kit/KitProfileTab.tsx`
  - Implement direct snooze/reschedule handlers
  - Remove indirect dialog opening for these actions

---

### Fix #5: Cycle Completion Not Triggered After Skips

**Problem:** When touches are skipped/completed, the cycle completion dialog doesn't appear for `user_defined` behavior.

**Root Cause:** The completion logic in `useKitTouches.ts` only checks if the current touch is the last in sequence. It doesn't account for skipped touches.

**Solution:** Update completion logic to check if ALL touches in the subscription are in terminal states (completed, skipped, missed).

**Files to Modify:**
- `src/hooks/useKitTouches.ts`
  - In `completeMutation` and `skipMutation`: After update, query all touches for subscription
  - If all are in terminal state AND behavior is `user_defined`, trigger a prompt
  - Add state/callback mechanism to surface the continuation prompt

- `src/components/kit/KitProfileTab.tsx`
  - Add `KitCycleCompleteDialog` component
  - Show dialog when cycle is complete asking: "Continue with another cycle?" or "Mark as completed"

- New file: `src/components/kit/KitCycleCompleteDialog.tsx`
  - Options: "Repeat Cycle", "Stop (Mark Complete)"
  - Calls appropriate subscription update

---

### Fix #6 & #7: Preset Editing Error

**Problem:** "Cannot read properties of undefined (reading 'touch_sequence')" when editing presets.

**Root Cause:** In `KitPresetList.tsx`, `handleSavePreset` calls:
```javascript
await updatePreset({ id: editingPreset.id, ...data });
```
But `updatePreset` expects: `{ id, updates }` format per `useKitPresets.ts`.

**Solution:** Fix the function call signature.

**Files to Modify:**
- `src/components/kit/presets/KitPresetList.tsx`
  - Line 88-89: Change from `{ id: editingPreset.id, ...data }` to `{ id: editingPreset.id, updates: data }`

---

### Fix #9: Skip Weekends Option

**Problem:** Touches scheduled on Sunday should auto-shift to Monday.

**Solution:** Add `skip_weekends` flag to subscriptions and handle in scheduling logic.

**Database Changes:**
- Add column `skip_weekends` (BOOLEAN DEFAULT false) to `kit_subscriptions` table

**Files to Modify:**
- `src/hooks/useKitSubscriptions.ts`
  - Add `skipWeekends` parameter to activation
  - In touch scheduling, if `skip_weekends` is true and date falls on Sunday, shift to Monday

- `src/components/kit/KitActivationDialog.tsx`
  - Add toggle: "Skip Sundays (move to Monday)"

- `src/hooks/useKitTouches.ts`
  - In `createNextCycle`, respect the skip_weekends flag

**Helper Function:**
```typescript
function adjustForWeekend(date: Date, skipWeekends: boolean): Date {
  if (!skipWeekends) return date;
  const day = date.getDay();
  if (day === 0) return addDays(date, 1); // Sunday -> Monday
  return date;
}
```

---

### Fix #10: Calendar KIT Touches - Name & Links

**Problem:** 
1. Calendar shows entity ID instead of name
2. Clicking doesn't open entity profile
3. No quick-action links (phone, WhatsApp, location)

**Solution:** Fetch entity name during calendar event transformation and add navigation + contact links.

**Files to Modify:**

**1. Fix entity name display:**
- `src/hooks/useCalendarEvents.ts`
  - After fetching kit_touches, batch-fetch entity names from leads/customers/professionals tables
  - Add `relatedEntityName` to the KIT touch events
  - Store phone/site_plus_code in event metadata

**2. Fix click navigation:**
- `src/components/calendar/CalendarEventCard.tsx`
  - For `kit-touch` type, implement `onClick` to navigate to entity profile with KIT tab
  - Add contact action buttons in the card/tooltip

**3. Add contact links to KitTouchCard:**
- `src/components/kit/KitTouchCard.tsx`
  - Import `PhoneLink` and `PlusCodeLink` components
  - Show phone link for call touches
  - Show WhatsApp link (https://wa.me/{phone}) for WhatsApp touches
  - Show location link for visit touches

**WhatsApp Link Helper:**
```typescript
function getWhatsAppLink(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return `https://wa.me/${normalized}`;
}
```

---

## Database Migration

```sql
-- Add skip_weekends column
ALTER TABLE kit_subscriptions 
ADD COLUMN skip_weekends BOOLEAN DEFAULT false;
```

---

## File Changes Summary

| File | Change Type | Issues Addressed |
|------|-------------|------------------|
| `src/components/kit/KitActivationDialog.tsx` | Major | #1, #8, #9 |
| `src/components/kit/KitTouchCard.tsx` | Major | #2, #4, #10 |
| `src/components/kit/KitProfileTab.tsx` | Moderate | #2, #3, #4, #5 |
| `src/components/kit/KitTouchCompleteDialog.tsx` | Minor | #4 |
| `src/components/kit/presets/KitPresetList.tsx` | Minor | #6, #7 |
| `src/hooks/useKitTouches.ts` | Major | #2, #5 |
| `src/hooks/useKitSubscriptions.ts` | Moderate | #1, #8, #9 |
| `src/hooks/useKitActivityLog.ts` | Minor | #3 |
| `src/hooks/useCalendarEvents.ts` | Major | #10 |
| `src/components/calendar/CalendarEventCard.tsx` | Moderate | #10 |
| `src/constants/activityLogConstants.ts` | Minor | #3 |
| New: `src/components/kit/KitCycleCompleteDialog.tsx` | New | #5 |

---

## Implementation Order

1. **Bug Fixes First:**
   - Fix #6/#7: Preset editing error (quick fix)
   - Fix #3: Skip activity logging

2. **Core Feature Improvements:**
   - Fix #5: Cycle completion detection
   - Fix #2: Assignee display and reassignment
   - Fix #4: Separate action buttons

3. **New Features:**
   - Fix #1/#8: Custom touch sequences
   - Fix #9: Skip weekends option

4. **Calendar & Contact Links:**
   - Fix #10: Entity names, navigation, contact links

---

## Testing Checklist

After implementation:
- [ ] Create and edit presets without errors
- [ ] Skip a touch and verify activity log entry appears
- [ ] Direct snooze and reschedule work without opening outcome dialog
- [ ] Skip/complete all touches and see cycle completion prompt (user_defined)
- [ ] View and reassign touch assignee from profile tab
- [ ] Create custom touch sequence without preset
- [ ] Enable skip weekends and verify Sunday touches shift to Monday
- [ ] Calendar KIT events show entity name, not ID
- [ ] Click calendar KIT event navigates to entity profile
- [ ] Touch card shows phone/WhatsApp/location links based on method
