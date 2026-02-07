

# KIT Module Enhancements - Implementation Plan

## Overview

This plan addresses additional enhancements to the Keep in Touch (KIT) module based on user feedback, including adding touches to active cycles, editing remaining touches, displaying staff names with designations, task/reminder creation, and calendar management capabilities.

---

## Issue Summary

| # | Issue | Type | Priority |
|---|-------|------|----------|
| 1 | Add touch to active cycle | Feature | High |
| 2 | Edit remaining touch points after activation | Feature | High |
| 3 | Display staff name + designation instead of email | UX Fix | Medium |
| 4 | Create task/reminder from touch (checkbox to auto-create) | Feature | High |
| 5 | Calendar card: Add Log, Snooze, Reschedule, Reassign options | Feature | High |
| 6 | Calendar: Show entity name instead of ID, with navigation | Bug Fix | High |
| 7 | Calendar: Add contact links (Phone, WhatsApp, Location) | Feature | Medium |
| 8 | Remaining fixes from previous plan (entity names in calendar) | Bug Fix | High |

---

## Technical Implementation

### Fix #1: Add Touch to Active Cycle

**Problem:** Users cannot add new touches to an already active KIT subscription.

**Solution:** Add an "Add Touch" button in the KitProfileTab that opens a dialog to insert a new touch into the sequence.

**Files to Modify:**

1. **`src/components/kit/KitProfileTab.tsx`**
   - Add "Add Touch" button near the "Remaining in Cycle" section
   - Implement `AddTouchDialog` trigger

2. **New File: `src/components/kit/AddTouchDialog.tsx`**
   - Dialog with touch method selector
   - Date picker for scheduled date
   - Time picker (optional)
   - Assignee selector using `buildStaffGroups` for "Role - Name" format
   - On save: insert new touch via `useKitTouches` mutation

3. **`src/hooks/useKitTouches.ts`**
   - Add `addTouchMutation` to insert a new touch with:
     - `subscription_id`
     - `method`
     - `scheduled_date`
     - `scheduled_time` (optional)
     - `assigned_to`
     - `sequence_index` (calculated as max existing + 1)
     - `status: 'pending'`

---

### Fix #2: Edit Remaining Touch Points After Activation

**Problem:** Users cannot modify upcoming touches in the active cycle (reschedule, reassign, change method).

**Solution:** Make remaining touch cards editable with inline edit options.

**Files to Modify:**

1. **`src/components/kit/KitTouchCard.tsx`**
   - Add edit mode for non-completed touches
   - Add "Edit" button that opens inline edit or edit dialog
   - Allow changing: method, scheduled_date, scheduled_time, assigned_to

2. **`src/components/kit/KitProfileTab.tsx`**
   - Pass `onEdit` handler to `KitTouchCard` for remaining touches
   - Enable edit actions for touches in "Remaining in Cycle" section

3. **New File: `src/components/kit/EditTouchDialog.tsx`**
   - Reusable edit dialog for touch properties
   - Fields: method, date, time, assignee
   - Calls update mutation from `useKitTouches`

4. **`src/hooks/useKitTouches.ts`**
   - Add `updateTouchMutation` to modify touch properties

---

### Fix #3: Display Staff Name + Designation Instead of Email

**Problem:** Touch cards and calendar show email addresses; should show "Role - Name" format.

**Solution:** Use `buildStaffGroups` helper and create a staff lookup to display formatted names.

**Files to Modify:**

1. **`src/components/kit/KitTouchCard.tsx`**
   - Import `useActiveStaff` and `buildStaffGroups`
   - Create staff lookup map
   - Replace `touch.assigned_to` display with formatted name: "Role - Name"

2. **`src/components/kit/KitProfileTab.tsx`**
   - Similar lookup for subscription `assigned_to` display

3. **`src/hooks/useCalendarEvents.ts`**
   - Add staff lookup when transforming events
   - Update `assignedTo` field to show formatted name

4. **`src/components/calendar/CalendarEventCard.tsx`**
   - Display will automatically update when `assignedTo` contains the formatted name

**Helper Function:**
```typescript
function getStaffDisplayName(email: string, staffMembers: ActiveStaffMember[]): string {
  const staff = staffMembers.find(s => s.email === email || s.name === email);
  if (staff) {
    const roleLabel = getRoleLabel(staff.role);
    return `${roleLabel} - ${staff.name}`;
  }
  return email;
}
```

---

### Fix #4: Create Task/Reminder from Touch

**Problem:** Users want to create a task or reminder when logging or creating a touch, with auto-linked reminder option.

**Solution:** Add checkbox options in touch completion and creation dialogs.

**Files to Modify:**

1. **`src/components/kit/KitTouchCompleteDialog.tsx`**
   - Add expandable section "Create Follow-up Actions"
   - Checkbox: "Create Task"
     - When checked: show task title input (pre-filled), due date (defaulting to tomorrow)
   - Checkbox: "Create Reminder" (auto-checked when task is checked)
     - When unchecked but task checked: reminder still optional
   - On submit: call `useTasks().addTask()` and `useReminders().addReminder()` as needed

2. **`src/components/kit/AddTouchDialog.tsx`**
   - Same checkboxes for creating task/reminder when adding a new touch

3. **`src/hooks/useReminders.ts`** (verify exists)
   - Ensure `addReminder` mutation is available

**UI Design:**
```text
┌─────────────────────────────────────┐
│ □ Create Task                       │
│   └─ Title: [Follow up with _____ ]│
│   └─ Due: [Tomorrow] [10:00 AM]    │
│   └─ □ Create Reminder for Task    │
│        └─ [30 min before]          │
└─────────────────────────────────────┘
```

---

### Fix #5 & #7: Calendar Card Management Options

**Problem:** Calendar KIT touch cards only show "View Related" - need Log, Snooze, Reschedule, Reassign actions plus contact links.

**Solution:** Enhance `CalendarEventCard` dropdown for kit-touch events.

**Files to Modify:**

1. **`src/components/calendar/CalendarEventCard.tsx`**
   - Add props for KIT-specific actions:
     - `onKitLog?: (event: CalendarEvent) => void`
     - `onKitSnooze?: (event: CalendarEvent, snoozeUntil: string) => void`
     - `onKitReschedule?: (event: CalendarEvent, newDate: string) => void`
     - `onKitReassign?: (event: CalendarEvent, newAssignee: string) => void`
   - Add dropdown menu items for kit-touch type:
     - "Log Touch" - opens completion dialog
     - "Snooze" - submenu with 1h, 2h, 4h, Tomorrow options
     - "Reschedule" - opens date picker
     - "Reassign" - opens staff selector
   - Add contact action buttons based on method:
     - Call: Phone icon with `PhoneLink`
     - WhatsApp: MessageCircle icon linking to `wa.me/{phone}`
     - Visit: MapPin icon with `PlusCodeLink`

2. **`src/pages/CalendarPage.tsx`**
   - Add state for KIT touch management dialogs
   - Implement handlers for kit touch actions
   - Pass handlers to calendar view components

3. **`src/components/calendar/CalendarDayView.tsx`** & other views
   - Pass new props to `CalendarEventCard`

4. **`src/hooks/useCalendarEvents.ts`**
   - Store entity phone and location in event metadata for contact links
   - Add fields: `entityPhone`, `entityLocation` to CalendarEvent interface

---

### Fix #6 & #8: Calendar Entity Names & Navigation

**Problem:** Calendar shows entity ID (e.g., "lead: cca9504e") instead of name; clicking doesn't navigate.

**Solution:** Fetch entity names and implement proper navigation.

**Files to Modify:**

1. **`src/hooks/useCalendarEvents.ts`**
   - After fetching kit_touches, batch-fetch entity details:
     ```typescript
     // Collect unique entity IDs by type
     const leadIds = kitTouches.filter(t => t.subscription?.entity_type === 'lead').map(t => t.subscription.entity_id);
     const customerIds = kitTouches.filter(t => t.subscription?.entity_type === 'customer').map(t => t.subscription.entity_id);
     const professionalIds = kitTouches.filter(t => t.subscription?.entity_type === 'professional').map(t => t.subscription.entity_id);
     
     // Fetch names and contact info
     const { data: leads } = await supabase.from('leads').select('id, name, phone, site_plus_code').in('id', leadIds);
     const { data: customers } = await supabase.from('customers').select('id, name, phone, site_plus_code').in('id', customerIds);
     const { data: professionals } = await supabase.from('professionals').select('id, name, phone, site_plus_code').in('id', professionalIds);
     ```
   - Build lookup maps and populate:
     - `relatedEntityName`: Entity name (e.g., "Rahul Sharma")
     - `entityPhone`: Phone number for contact links
     - `entityLocation`: Plus code for location links

2. **`src/components/calendar/CalendarEventCard.tsx`**
   - Update badge to show entity name instead of ID
   - Implement `onViewRelated` to navigate to entity profile with `?tab=kit`
   - Add navigation URL builder:
     ```typescript
     const getEntityUrl = (entityType: string, entityId: string) => {
       const typeMap = { lead: 'leads', customer: 'customers', professional: 'professionals' };
       return `/${typeMap[entityType]}?selected=${entityId}&tab=kit`;
     };
     ```

3. **`src/pages/CalendarPage.tsx`**
   - Implement `handleViewRelated` to navigate using `useNavigate`

**Event Title Update:**
Change from: `Call (regular type call message call)` with `lead: cca9504e`
To: `Call - Rahul Sharma (Monthly Check-in)`

---

## CalendarEvent Interface Update

```typescript
export interface CalendarEvent {
  // Existing fields...
  
  // New fields for KIT enhancement
  entityPhone?: string | null;
  entityLocation?: string | null;
  touchMethod?: string; // For contact link logic
}
```

---

## File Changes Summary

| File | Change Type | Issues Addressed |
|------|-------------|------------------|
| `src/components/kit/KitProfileTab.tsx` | Major | #1, #2, #3 |
| `src/components/kit/KitTouchCard.tsx` | Major | #2, #3 |
| `src/components/kit/KitTouchCompleteDialog.tsx` | Major | #4 |
| `src/components/kit/AddTouchDialog.tsx` | New | #1, #4 |
| `src/components/kit/EditTouchDialog.tsx` | New | #2 |
| `src/hooks/useKitTouches.ts` | Moderate | #1, #2 |
| `src/hooks/useCalendarEvents.ts` | Major | #3, #6, #7, #8 |
| `src/components/calendar/CalendarEventCard.tsx` | Major | #5, #6, #7 |
| `src/pages/CalendarPage.tsx` | Moderate | #5, #6 |
| `src/components/calendar/CalendarDayView.tsx` | Minor | #5 |
| `src/components/calendar/CalendarAgendaView.tsx` | Minor | #5 |
| `src/components/calendar/CalendarWeekView.tsx` | Minor | #5 |

---

## Implementation Order

1. **Fix Entity Names in Calendar (#6, #8)**
   - Update `useCalendarEvents.ts` to fetch entity names and contact info
   - This is the foundational fix others depend on

2. **Update Calendar Event Card (#5, #7)**
   - Add KIT action handlers and contact links
   - Implement navigation to entity profiles

3. **Staff Name Display (#3)**
   - Create helper function and update touch cards
   - Update calendar event transformation

4. **Add/Edit Touch Features (#1, #2)**
   - Create AddTouchDialog and EditTouchDialog
   - Add mutations to useKitTouches

5. **Task/Reminder Creation (#4)**
   - Enhance KitTouchCompleteDialog with checkboxes
   - Implement task/reminder creation logic

---

## Testing Checklist

After implementation:
- [ ] Calendar KIT touches show entity name (e.g., "Call - Rahul Sharma")
- [ ] Clicking calendar KIT event navigates to entity profile's KIT tab
- [ ] Touch cards display "Role - Name" format for assignees
- [ ] Can add new touch to active cycle
- [ ] Can edit remaining touches (reschedule, reassign, change method)
- [ ] Calendar dropdown shows Log, Snooze, Reschedule, Reassign options
- [ ] Contact links work: Phone call, WhatsApp chat, Maps location
- [ ] Task/Reminder checkboxes create proper records
- [ ] Task with reminder auto-checked creates both records

