
# KIT Module Fixes & Enhancements - Implementation Plan

## Overview

This plan addresses the remaining issues with the KIT module integration, including activity logging, task visibility, touch management, and clickable contact methods.

---

## Issues Summary

| # | Issue | Type | Priority |
|---|-------|------|----------|
| 1 | Upcoming touch needs edit option | Feature | High |
| 2 | KIT activity not fully logged (add touch, create task/reminder) | Bug | High |
| 3 | Touch method (Call, WhatsApp, Visit) should be clickable links | UX | High |
| 4 | Tasks created by KIT don't show in Lead's Task Tab | Bug | Critical |
| 5 | Task table shows "View Details" instead of lead name for KIT tasks | Bug | High |
| 6 | Task/Reminder should update when touch is edited | Feature | Medium |
| 7 | Lead name click in task profile window doesn't navigate | Bug | High |
| 8 | Add KIT task type section with control panel integration | Feature | Medium |
| 9 | Assigned to column shows email instead of name for KIT tasks | Bug | Medium |

---

## Technical Analysis

### Root Cause Analysis

**Issue #4 (Tasks not showing in Lead Task Tab):**
The `LeadTasksTab.tsx` filters tasks using:
```typescript
let filtered = tasks.filter(t => t.lead_id === lead.id);
```
But KIT creates tasks with `related_entity_type` and `related_entity_id`, NOT `lead_id`. This means KIT tasks are never matched.

**Issue #5 (Shows "View Details" instead of name):**
In `EnhancedTaskTable.tsx`, when a task has `related_entity_type` but no `task.lead` object, it tries to look up the entity from local state. For leads with `related_entity_type: 'lead'`, it falls back to "View Details" because the lookup doesn't populate the name correctly.

**Issue #2 (Activity not logged):**
The `handleAddTouch` function in `KitProfileTab.tsx` calls `addTouch()`, `addTask()`, and `addReminder()` but never calls any activity logging functions like `logTouchAdded()`.

**Issue #7 (Lead name click doesn't navigate):**
The `handleOpenRelated` function in `TaskDetailView.tsx` calls `openLeadDetailById` which opens a modal, but the modal may not be properly initialized or the lead data may not be found in the store.

---

## Implementation Details

### Fix #1: Add Edit Option to Upcoming Touch

**Problem:** The upcoming touch section doesn't have an edit button like the remaining touches.

**Solution:** Add `onEdit` prop to the upcoming touch's `KitTouchCard`.

**File:** `src/components/kit/KitProfileTab.tsx`

```typescript
// In the Upcoming Touch section (around line 475-486)
<KitTouchCard
  touch={nextTouch}
  onComplete={() => setCompleteDialogTouch(nextTouch)}
  onSnooze={(snoozeUntil) => handleDirectSnooze(nextTouch, snoozeUntil)}
  onReschedule={(newDate) => handleDirectReschedule(nextTouch, newDate)}
  onSkip={() => handleSkipTouch(nextTouch)}
  onReassign={(newAssignee) => handleReassignTouch(nextTouch, newAssignee)}
  onEdit={() => setEditingTouch(nextTouch)}  // ADD THIS LINE
  disabled={isTouchCompleting || isSnoozing || isRescheduling || isSkipping}
  entityPhone={entityPhone}
  entityLocation={entityLocation}
/>
```

---

### Fix #2: Complete KIT Activity Logging

**Problem:** Adding a touch, creating task, creating reminder - none are logged.

**Solution:** Add new logging functions and call them in handlers.

**File:** `src/hooks/useKitActivityLog.ts`

Add new functions:
```typescript
const logTouchAdded = async (
  params: LogKitActivityParams & { method: KitTouchMethod; scheduledDate: string }
) => {
  await logActivity({
    ...params,
    activityType: 'kit_touch_added',
    title: `New ${params.method} touch scheduled`,
    description: `Scheduled for ${params.scheduledDate}`,
    metadata: { method: params.method, scheduled_date: params.scheduledDate },
  });
};

const logTouchEdited = async (
  params: LogKitActivityParams & { method: KitTouchMethod; changes: string }
) => {
  await logActivity({
    ...params,
    activityType: 'kit_touch_edited',
    title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch updated`,
    description: params.changes,
    metadata: { method: params.method },
  });
};

const logTaskCreatedFromKit = async (
  params: LogKitActivityParams & { taskTitle: string }
) => {
  await logActivity({
    ...params,
    activityType: 'kit_task_created',
    title: `Task created from KIT: "${params.taskTitle}"`,
    metadata: { task_title: params.taskTitle },
  });
};

const logReminderCreatedFromKit = async (
  params: LogKitActivityParams & { reminderTitle: string }
) => {
  await logActivity({
    ...params,
    activityType: 'kit_reminder_created',
    title: `Reminder created from KIT: "${params.reminderTitle}"`,
    metadata: { reminder_title: params.reminderTitle },
  });
};
```

**File:** `src/components/kit/KitProfileTab.tsx`

Update `handleAddTouch`:
```typescript
const handleAddTouch = async (data: { ... }) => {
  // ... existing code ...
  
  await addTouch({ ... });
  
  // Log the touch addition
  await logTouchAdded({
    entityType,
    entityId,
    entityName,
    method: data.method as KitTouchMethod,
    scheduledDate: data.scheduledDate,
  });
  
  if (data.createTask && data.taskTitle) {
    await addTask({ ... });
    await logTaskCreatedFromKit({
      entityType,
      entityId,
      entityName,
      taskTitle: data.taskTitle,
    });
    
    if (data.createReminder) {
      await addReminder({ ... });
      await logReminderCreatedFromKit({
        entityType,
        entityId,
        entityName,
        reminderTitle: data.taskTitle,
      });
    }
  }
};
```

Also update `handleEditTouch` to log changes.

---

### Fix #3: Make Touch Methods Clickable

**Problem:** Touch method labels are just text, not clickable.

**Solution:** In `KitTouchCard.tsx`, make the method label itself a clickable link based on the method type.

**File:** `src/components/kit/KitTouchCard.tsx`

Replace the static method display:
```typescript
// Instead of just showing the method name, make it clickable
const renderMethodWithLink = () => {
  const methodLabel = touch.method.charAt(0).toUpperCase() + touch.method.slice(1);
  
  if (touch.method === 'call' && entityPhone) {
    return (
      <a href={`tel:${entityPhone}`} className="font-medium hover:underline text-primary">
        {methodLabel}
      </a>
    );
  }
  if (touch.method === 'whatsapp' && entityPhone) {
    return (
      <a href={getWhatsAppLink(entityPhone)} target="_blank" rel="noopener noreferrer" 
         className="font-medium hover:underline text-primary">
        {methodLabel}
      </a>
    );
  }
  if (touch.method === 'visit') {
    if (entityLocation) {
      return (
        <PlusCodeLink plusCode={entityLocation} className="font-medium hover:underline" />
      );
    }
    // No location - could link to profile tab with address
    return <span className="font-medium">{methodLabel}</span>;
  }
  return <span className="font-medium capitalize">{methodLabel}</span>;
};
```

---

### Fix #4: Tasks Created by KIT Not Showing in Lead Task Tab (CRITICAL)

**Problem:** `LeadTasksTab` only filters by `lead_id`, but KIT creates tasks with `related_entity_type: 'lead'` and `related_entity_id`.

**Solution A (Recommended):** Update task filtering in `LeadTasksTab.tsx` to also check `related_entity_id`:

```typescript
// Current:
let filtered = tasks.filter(t => t.lead_id === lead.id);

// Fix:
let filtered = tasks.filter(t => 
  t.lead_id === lead.id || 
  (t.related_entity_type === 'lead' && t.related_entity_id === lead.id)
);
```

**Solution B (Also Needed):** When creating tasks from KIT for leads, also set `lead_id`:

**File:** `src/components/kit/KitProfileTab.tsx`

```typescript
// In handleAddTouch, when creating task:
await addTask({
  title: data.taskTitle,
  description: `KIT touch follow-up for ${entityName}`,
  type: 'KIT Follow-up', // Use new KIT type
  priority: 'Medium',
  status: 'Pending',
  assigned_to: data.assignedTo,
  due_date: data.scheduledDate,
  lead_id: entityType === 'lead' ? entityId : null,  // ADD THIS
  related_entity_type: entityType,
  related_entity_id: entityId,
});
```

---

### Fix #5: Task Table Shows "View Details" Instead of Lead Name

**Problem:** For tasks with `related_entity_type: 'lead'`, the name lookup fails.

**Solution:** Improve the `getRelatedEntityDisplay` function to properly look up names from all entity stores.

**File:** `src/components/tasks/EnhancedTaskTable.tsx`

```typescript
const getRelatedEntityDisplay = (task: Task & { computedStatus: string }) => {
  // First, check if lead data is directly on the task
  if (task.lead) {
    return {
      name: task.lead.name,
      phone: task.lead.phone,
      type: 'Lead',
      icon: <User className="h-3 w-3" />
    };
  }
  
  // For related_entity_type, look up from appropriate store
  if (task.related_entity_type && task.related_entity_id) {
    if (task.related_entity_type === 'lead') {
      const lead = leads.find(l => l.id === task.related_entity_id);
      if (lead) {
        return {
          name: lead.name,
          phone: lead.phone,
          type: 'Lead',
          icon: <User className="h-3 w-3" />
        };
      }
    }
    if (task.related_entity_type === 'customer') {
      const customer = customers.find(c => c.id === task.related_entity_id);
      if (customer) {
        return {
          name: customer.name,
          phone: customer.phone,
          type: 'Customer',
          icon: <Building2 className="h-3 w-3" />
        };
      }
    }
    if (task.related_entity_type === 'professional') {
      const professional = professionals.find(p => p.id === task.related_entity_id);
      if (professional) {
        return {
          name: professional.name,
          phone: professional.phone,
          type: 'Professional',
          icon: <UserCheck className="h-3 w-3" />
        };
      }
    }
    // Fallback if not found in stores
    return {
      name: 'View Details',
      phone: null,
      type: task.related_entity_type,
      icon: <User className="h-3 w-3" />
    };
  }
  return null;
};
```

Also update the cell rendering for "relatedTo" column to use this improved function.

---

### Fix #6: Update Task/Reminder When Touch is Edited

**Problem:** Editing a touch doesn't update its linked task/reminder.

**Analysis:** This requires storing the link between touch and task/reminder. Currently, there's no stored relationship.

**Solution:** Add optional fields to `kit_touches` table to track linked task/reminder IDs, then update them when touch is edited.

**Database Migration:**
```sql
ALTER TABLE kit_touches 
ADD COLUMN linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
ADD COLUMN linked_reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL;
```

**Update workflow:**
1. When creating a touch with task/reminder, store the IDs
2. When editing a touch, update the linked task's due_date and assigned_to
3. When deleting/skipping a touch, optionally update the linked task status

---

### Fix #7: Lead Name Click in Task Detail Doesn't Navigate

**Problem:** Clicking on lead name in `TaskDetailView` should open the lead profile but may fail.

**Solution:** Ensure proper error handling and fallback navigation.

**File:** `src/components/tasks/TaskDetailView.tsx`

The current `openLeadDetailById` function already handles this, but we need to ensure the modal correctly passes through z-index layering. The issue might be that the lead lookup from the store fails for newly created KIT tasks.

Add async fetch if not in store:
```typescript
const handleOpenRelated = async () => {
  if (!related) return;
  
  if (related.type === "lead") {
    // Try store first
    const leadFromStore = leads.find((l) => l.id === related.id);
    if (leadFromStore) {
      setSelectedLead(leadFromStore);
      setLeadDetailOpen(true);
      return;
    }
    
    // Fetch from database
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", related.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSelectedLead(data as unknown as Lead);
        setLeadDetailOpen(true);
      } else {
        toast({ title: "Lead not found", variant: "destructive" });
      }
    } catch (e: any) {
      console.error("Failed to fetch lead:", e);
      toast({ title: "Could not open lead", description: e?.message || "Please try again.", variant: "destructive" });
    }
    return;
  }
  // ... rest of handler
};
```

---

### Fix #8: Add KIT Task Type Section to Control Panel

**Problem:** Need a separate "KIT" section for task types, editable from Control Panel.

**Solution:** Add a new section in the task types with KIT-specific options.

**File:** `src/hooks/useControlPanelSettings.ts`

Add to the `tasks` module's `fields` array:
```typescript
{
  fieldName: "type",
  displayName: "Task Type",
  allowColors: false,
  options: [
    // Standard task types
    { id: "tt1", label: "Follow-up Call", value: "Follow-up Call", ... },
    // ... existing options ...
    
    // KIT Section (using a separator pattern)
    { id: "tt_kit1", label: "KIT - Touch Follow-up", value: "KIT Follow-up", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 10, category: "kit" },
    { id: "tt_kit2", label: "KIT - Relationship Check", value: "KIT Relationship Check", isActive: true, isDefault: false, isSystemReserved: false, sortOrder: 11, category: "kit" },
  ],
},
```

**File:** `src/components/tasks/AddTaskDialog.tsx` and `EditTaskDialog.tsx`

Group task types in the selector, similar to how designations are grouped:
```typescript
<SelectContent>
  <SelectGroup>
    <SelectLabel>Standard Tasks</SelectLabel>
    {standardTaskTypes.map(type => (
      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
    ))}
  </SelectGroup>
  <SelectGroup>
    <SelectLabel>KIT Tasks</SelectLabel>
    {kitTaskTypes.map(type => (
      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
    ))}
  </SelectGroup>
</SelectContent>
```

---

### Fix #9: Assigned To Shows Email Instead of Name

**Problem:** KIT-created tasks show email in the assigned_to column.

**Root Cause:** KIT uses email for assignment (from staff selector), but display lookup expects name.

**Solution:** Use the staff lookup helper in the table rendering.

**File:** `src/components/tasks/EnhancedTaskTable.tsx`

For the "assignedTo" column cell:
```typescript
case "assignedTo":
  // Use staff lookup to show "Role - Name" format
  return <span className="text-sm">{getStaffDisplayName(task.assigned_to, staffMembers)}</span>;
```

Import the helper and hook:
```typescript
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { getStaffDisplayName } from '@/lib/kitHelpers';

// Inside component:
const { staffMembers } = useActiveStaff();
```

---

## File Changes Summary

| File | Change Type | Issues Addressed |
|------|-------------|------------------|
| `src/components/kit/KitProfileTab.tsx` | Moderate | #1, #2, #4 |
| `src/components/kit/KitTouchCard.tsx` | Moderate | #3 |
| `src/hooks/useKitActivityLog.ts` | Moderate | #2 |
| `src/components/leads/detail-tabs/LeadTasksTab.tsx` | Minor | #4 |
| `src/components/tasks/EnhancedTaskTable.tsx` | Major | #5, #9 |
| `src/components/tasks/TaskDetailView.tsx` | Minor | #7 |
| `src/hooks/useControlPanelSettings.ts` | Moderate | #8 |
| `src/components/tasks/AddTaskDialog.tsx` | Minor | #8 |
| `src/components/tasks/EditTaskDialog.tsx` | Minor | #8 |
| `src/constants/activityLogConstants.ts` | Minor | #2 |
| Database Migration | New | #6 |

---

## Implementation Order

1. **Critical Fixes First:**
   - Fix #4: Task visibility in Lead Task Tab
   - Fix #5: Entity name display in Task Table

2. **Activity Logging:**
   - Fix #2: Complete activity logging for all KIT actions

3. **UX Improvements:**
   - Fix #1: Add edit to upcoming touch
   - Fix #3: Make touch methods clickable
   - Fix #9: Staff name display in task table

4. **Navigation Fixes:**
   - Fix #7: Lead click navigation

5. **Feature Additions:**
   - Fix #8: KIT task type section
   - Fix #6: Linked task/reminder updates (requires DB migration)

---

## Testing Checklist

After implementation:
- [ ] Create a KIT touch and verify it appears in activity log
- [ ] Create a touch with task/reminder and verify both appear in activity log
- [ ] Verify KIT-created tasks appear in Lead's Task Tab
- [ ] Verify task table shows lead name, not "View Details"
- [ ] Verify assigned_to shows "Role - Name" format
- [ ] Click on lead name in Task Profile and verify it opens lead
- [ ] Click on touch method (Call/WhatsApp/Visit) and verify link works
- [ ] Edit upcoming touch and verify changes save
- [ ] Verify KIT task types appear in task creation form
