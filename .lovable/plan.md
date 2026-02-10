
# Fix Plan: KIT Contact Links, Dialog Interactions, Task Navigation & Z-Index Layering

## Issues Identified

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Touch methods (Call/WhatsApp/Visit) not clickable | `LeadDetailView` does not pass `entityPhone` / `entityLocation` props to `KitProfileTab` |
| 2 | Edit/Add Touch dialog options not working | `SelectContent` inside z-[100] dialogs lacks its own z-index, so dropdowns render behind the dialog |
| 3 | Task title link in Task Management not working | Likely the click handler on task title was regressed; need to verify and fix |
| 4 | Task profile opens behind Lead profile | `TaskDetailModalProvider` renders `TaskDetailView` at z-[60], but Lead profile is z-[70]. When task is opened from inside Lead, it appears behind |
| 5 | KIT not in Backup modules | `BackupModuleKey` type and `MODULES` array in backup panel don't include KIT |
| 6 | KIT not in Automation entity types | `ENTITY_TYPES` in automation constants doesn't include KIT |

---

## Fix #1: Pass entityPhone and entityLocation to KitProfileTab

**File:** `src/components/leads/LeadDetailView.tsx` (line ~419-424)

Currently:
```tsx
<KitProfileTab
  entityType="lead"
  entityId={currentLead.id}
  entityName={currentLead.name}
  defaultAssignee={currentLead.assigned_to}
/>
```

Add the missing props:
```tsx
<KitProfileTab
  entityType="lead"
  entityId={currentLead.id}
  entityName={currentLead.name}
  defaultAssignee={currentLead.assigned_to}
  entityPhone={currentLead.phone || undefined}
  entityLocation={currentLead.site_plus_code || undefined}
/>
```

Same fix needed in `CustomerDetailView.tsx` if it has a KIT tab.

---

## Fix #2: SelectContent z-index in Edit/Add Touch Dialogs

**Files:** `src/components/kit/EditTouchDialog.tsx`, `src/components/kit/AddTouchDialog.tsx`

All `SelectContent` elements inside these dialogs need `className="z-[200]"` and all `PopoverContent` (for the calendar date picker) need `className="... z-[200]"` to render above the z-[100] dialog.

Changes for each dialog:
- Every `<SelectContent>` gets `className="z-[200]"`
- Every `<PopoverContent>` (calendar) gets z-[200] added

---

## Fix #3: Task Title Click in Task Management Table

**File:** `src/components/tasks/EnhancedTaskTable.tsx`

Need to verify the task title cell has a working `onClick` handler that calls `openTask(task.id)` from the `useTaskDetailModal` context. If the handler was removed or broken during refactoring, restore it.

---

## Fix #4: Task Profile Z-Index Layering (Definitive Fix)

**Root Cause:** The `TaskDetailModalProvider` in `App.tsx` renders `TaskDetailView` at the app root level with z-[60]. When a task is opened from inside a Lead profile (z-[70]), the task window appears behind the lead.

**Solution:** Update the z-index hierarchy to be context-aware:
- `TaskDetailView` dialog: z-[60] -> **z-[80]** (so it always appears above entity profiles)
- `LeadDetailView` / `CustomerDetailView`: keep at z-[70]
- Sub-dialogs inside TaskDetailView (edit, delete, complete): z-[100]
- KIT dialogs: z-[100]
- SelectContent/DropdownContent inside z-[100] dialogs: z-[200]

**Files to update:**
- `src/components/tasks/TaskDetailView.tsx`: Change `z-[60]` to `z-[80]`
- Nested entity views opened FROM TaskDetailView (LeadDetailView, CustomerDetailView rendered inside TaskDetailView.tsx at lines 539-555) need z-[90] so they appear above the task window

**Revised Z-Index Hierarchy:**

```text
Layer 1: Entity profiles (Lead/Customer/Professional) - z-[70]
Layer 2: Task Detail (global modal) - z-[80]
Layer 3: Entity profiles opened FROM Task Detail - z-[90]
Layer 4: Action dialogs (Edit, Complete, KIT dialogs) - z-[100]
Layer 5: Dropdowns/Selects inside action dialogs - z-[200]
```

---

## Fix #5: Add KIT to Backup System

**File:** `src/hooks/useCrmBackups.ts`
- Add `"kit"` to `BackupModuleKey` type

**File:** `src/components/settings/BackupRestorePanel.tsx`
- Add KIT module to the `MODULES` array:
  ```typescript
  { key: "kit", label: "Keep in Touch", description: "KIT subscriptions, touches, presets" }
  ```

**File:** `supabase/functions/crm-backup-create/index.ts`
- Add KIT data export logic (kit_subscriptions, kit_touches, kit_presets)

**File:** `supabase/functions/crm-backup-restore/index.ts`
- Add KIT data restore logic

---

## Fix #6: Add KIT to Automation Entity Types

**File:** `src/constants/automationConstants.ts`
- Add to `ENTITY_TYPES`:
  ```typescript
  { value: "kit", label: "Keep in Touch", icon: "HeartHandshake" }
  ```

**File:** `src/types/automation/core.ts`
- Add `"kit"` to the `EntityType` union type

---

## File Changes Summary

| File | Change | Issues |
|------|--------|--------|
| `src/components/leads/LeadDetailView.tsx` | Add entityPhone/entityLocation props | #1 |
| `src/components/customers/CustomerDetailView.tsx` | Add entityPhone/entityLocation props (if KIT tab exists) | #1 |
| `src/components/kit/EditTouchDialog.tsx` | Add z-[200] to SelectContent and PopoverContent | #2 |
| `src/components/kit/AddTouchDialog.tsx` | Add z-[200] to SelectContent and PopoverContent | #2 |
| `src/components/tasks/EnhancedTaskTable.tsx` | Verify/fix task title click handler | #3 |
| `src/components/tasks/TaskDetailView.tsx` | Change z-[60] to z-[80] | #4 |
| `src/components/tasks/TaskDetailView.tsx` (nested views) | Pass higher z-index props or override | #4 |
| `src/hooks/useCrmBackups.ts` | Add "kit" to BackupModuleKey | #5 |
| `src/components/settings/BackupRestorePanel.tsx` | Add KIT module entry | #5 |
| `supabase/functions/crm-backup-create/index.ts` | Add KIT export logic | #5 |
| `supabase/functions/crm-backup-restore/index.ts` | Add KIT restore logic | #5 |
| `src/constants/automationConstants.ts` | Add KIT entity type | #6 |
| `src/types/automation/core.ts` | Add "kit" to EntityType | #6 |

---

## Implementation Order

1. Z-index hierarchy fix (Fix #4) - resolves the recurring layering issues
2. Pass missing props to KitProfileTab (Fix #1) - enables contact links
3. Dialog SelectContent z-index (Fix #2) - makes Edit/Add dialogs functional
4. Task title click fix (Fix #3)
5. Backup integration (Fix #5)
6. Automation integration (Fix #6)
