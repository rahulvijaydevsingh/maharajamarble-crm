

# Fix Plan: Remaining Issues - Staff, Dialogs, Bulk Upload, and Automation Triggers

## Issues Found

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Deleted staff still showing (grayed out) | `delete-staff-user` edge function only deactivates profile (`is_active: false`) but doesn't remove them from the list. `fetchStaffMembers` in `useStaffManagement.ts` queries ALL profiles with no filter. |
| 2 | Bulk lead upload list not scrollable, limited columns | `ScrollArea` wrapping the table has `flex-1` but parent container constrains height. Also only 6 columns shown (Row, Name, Phone, Source, Status, Issues). |
| 3 | Add Quotation / Add Reminder dialogs still behind profile | The `contentClassName="z-[80]"` is applied to `DialogContent`, but the `DialogOverlay` inside `dialog.tsx` is hardcoded at `z-50`. The parent profile dialog at `z-[70]` renders above the overlay, blocking interaction. |
| 4 | Reset password still errors | Edge function `reset-staff-password` exists and was deployed, but may have deployment issues. Need to verify and redeploy. |
| 5 | No "staff_activity_log" trigger in automation | The automation system's `ENTITY_FIELDS` and `TRIGGER_TYPES` don't include staff activity as a trigger source. |
| 6 | No "field currently has value" trigger (static condition) | `FIELD_CHANGE_WHEN_OPTIONS` only has change-based triggers. Missing a "field_matches" / "field_currently_equals" option for triggering on existing data. |

---

## Implementation Details

### 1. Hide Deleted Staff from List (or Mark Clearly)

**File:** `src/hooks/useStaffManagement.ts`

The `fetchStaffMembers` function queries all profiles. After deletion, the profile is deactivated but still shows. Two options:

- **Option A (Recommended):** Filter out profiles that have no `user_roles` entry (deleted staff have their role removed). After fetching profiles, filter those with `roleData === null` AND `is_active === false` (truly deleted, not just deactivated).
- **Option B:** Add a `is_deleted` column to profiles (requires migration).

Implementation: In the `fetchStaffMembers` mapping, if `roleData` is null AND `is_active` is false, exclude them from the results. This differentiates "deactivated" (has role, not active) from "deleted" (no role, not active).

### 2. Fix Bulk Upload Validation List (Scrollable + More Columns)

**File:** `src/components/leads/BulkUploadDialog.tsx`

**Scrolling fix:** The `ScrollArea` at line 1133 needs an explicit `max-height` or the parent needs `min-h-0` to allow flex children to shrink. Add `className="flex-1 border rounded-md max-h-[400px]"` to the ScrollArea.

**More columns:** Add columns for Email, Priority, Assigned To, Materials, Construction Stage, Address, Notes. The data is already parsed and available in the `ParsedLead` object. Update the table to show all relevant columns with horizontal scroll.

### 3. Fix Dialog Z-Index Stacking (Root Cause Fix)

**File:** `src/components/ui/dialog.tsx`

The real problem: `DialogOverlay` is hardcoded at `z-50`. When `DialogContent` gets `z-[80]`, the overlay stays at `z-50`, which is below the parent dialog's content at `z-[70]`. The overlay blocks pointer events.

**Fix:** Make the overlay's z-index match the content's z-index. Extract the z-index from the className prop and apply it to both overlay and content. Or simpler: when a className contains a custom z-index, apply it to the entire portal container.

**Simplest approach:** Modify `DialogContent` to accept an `overlayClassName` prop that gets forwarded to `DialogOverlay`. Then in `AddQuotationDialog` and `AddReminderDialog`, pass both `contentClassName` for the content z-index and the overlay z-index.

**Even simpler:** Change the dialog.tsx `DialogContent` to use the same className's z-index for both overlay and content by wrapping them in a div with the z-index class.

### 4. Redeploy Reset Password Edge Function

The `reset-staff-password` edge function exists and looks correct. Need to redeploy it and test it to confirm it works.

### 5. Add "Field Currently Matches" Trigger Type

**Concept:** A new trigger option called "field_matches" or "field_currently_equals" that fires based on an existing field value rather than a change. This enables automations like "for all leads with medium priority, do X."

**Files to modify:**

- `src/constants/automationConstants.ts` - Add new `FIELD_CHANGE_WHEN_OPTIONS` entry: `{ value: "field_matches", label: "Field currently has value..." }`
- `src/types/automation/triggers.ts` - Add `"field_matches"` to the `when` union in `FieldChangeTriggerConfig`
- `src/components/automation/TriggerConditionBlock.tsx` - Add UI for `field_matches` showing field selector + operator + value (operators: equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty)

This allows creating rules like:
- "When field `priority` currently equals `medium`" - triggers for all existing records matching
- Combined with a time-based or count-based secondary condition for periodic checks

### 6. Add Staff Activity Log as Automation Trigger Source

**Files to modify:**

- `src/constants/automationConstants.ts` - Add `"staff_activity"` to `ENTITY_TYPES` and define `ENTITY_FIELDS` for it (action_type, user_email, entity_type, etc.)
- `src/types/automation/core.ts` - Add `"staff_activity"` to `EntityType` union

This allows automations like:
- "When a staff member logs in, send a notification"
- "When a staff creates a lead, trigger a follow-up task"

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useStaffManagement.ts` | Filter out deleted staff (no role + inactive) from list |
| `src/components/leads/BulkUploadDialog.tsx` | Add explicit max-height to ScrollArea, add more columns (Email, Priority, Assigned To, Materials, etc.) with horizontal scroll |
| `src/components/ui/dialog.tsx` | Support `overlayClassName` prop to allow z-index override on overlay |
| `src/components/quotations/AddQuotationDialog.tsx` | Pass overlay z-index alongside content z-index |
| `src/components/leads/detail-tabs/AddReminderDialog.tsx` | Pass overlay z-index alongside content z-index |
| `src/components/professionals/ProfessionalDetailView.tsx` | Update dialog calls with overlay z-index |
| `src/constants/automationConstants.ts` | Add "field_matches" to FIELD_CHANGE_WHEN_OPTIONS; add "staff_activity" entity type with fields |
| `src/types/automation/triggers.ts` | Add "field_matches" to FieldChangeTriggerConfig when union |
| `src/types/automation/core.ts` | Add "staff_activity" to EntityType |
| `src/components/automation/TriggerConditionBlock.tsx` | Add UI for "field_matches" trigger with operator selector |

## Edge Function Actions

- Redeploy `reset-staff-password` edge function

## Implementation Order

1. Fix dialog z-index (root cause in dialog.tsx + overlay)
2. Fix deleted staff visibility in list
3. Fix bulk upload scrolling + add more columns
4. Redeploy reset-staff-password
5. Add "field_matches" trigger type to automation
6. Add staff_activity as automation entity type

