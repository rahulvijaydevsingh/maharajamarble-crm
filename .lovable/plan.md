

# Keep in Touch (KIT) Module - Implementation Plan

## Overview

The Keep in Touch (KIT) module is a relationship nurturing system that creates automated, recurring touch points (calls, WhatsApp, visits, emails, meetings) with Leads, Customers, and Professionals. This plan details the phased implementation approach for this feature.

## Technical Architecture Summary

### Database Schema (New Tables)

```text
+---------------------+     +----------------------+     +------------------+
| kit_presets         |     | kit_subscriptions    |     | kit_touches      |
+---------------------+     +----------------------+     +------------------+
| id (PK)             |<----| preset_id (FK)       |<----| subscription_id  |
| name                |     | id (PK)              |     | id (PK)          |
| touch_sequence      |     | entity_type          |     | sequence_index   |
| default_cycle_behav |     | entity_id            |     | method           |
| is_active           |     | status               |     | scheduled_date   |
| created_by          |     | current_step         |     | status           |
+---------------------+     | cycle_count          |     | outcome          |
                            +----------------------+     +------------------+

+---------------------+     +------------------+
| kit_touch_methods   |     | kit_outcomes     |
+---------------------+     +------------------+
| id (PK)             |     | id (PK)          |
| value (call, etc.)  |     | value            |
| label               |     | label            |
| icon                |     | requires_followup|
| is_active           |     | is_positive      |
+---------------------+     +------------------+
```

### Entity Table Modifications
- `leads`: Add `kit_subscription_id`, `kit_status`
- `customers`: Add `kit_subscription_id`, `kit_status`
- `professionals`: Add `kit_subscription_id`, `kit_status`

---

## Implementation Phases

### Phase 1: Core Infrastructure (Database & Base Hooks)

**Database Migration:**

1. Create `kit_presets` table:
   - `id` (UUID, PK)
   - `name` (TEXT, NOT NULL)
   - `description` (TEXT)
   - `touch_sequence` (JSONB) - Array of touch definitions
   - `default_cycle_behavior` (TEXT) - one_time | auto_repeat | user_defined
   - `is_active` (BOOLEAN, DEFAULT true)
   - `created_by` (TEXT)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. Create `kit_subscriptions` table:
   - `id` (UUID, PK)
   - `entity_type` (TEXT) - lead | customer | professional
   - `entity_id` (UUID)
   - `preset_id` (UUID, FK to kit_presets)
   - `status` (TEXT) - active | paused | completed | cancelled
   - `assigned_to` (TEXT)
   - `cycle_count`, `max_cycles`, `current_step` (INTEGER)
   - `pause_until`, `pause_reason` (for pause functionality)
   - `started_at`, `completed_at`, `created_at`, `updated_at`

3. Create `kit_touches` table:
   - `id` (UUID, PK)
   - `subscription_id` (UUID, FK to kit_subscriptions)
   - `sequence_index` (INTEGER)
   - `method` (TEXT) - call | whatsapp | visit | email | meeting
   - `scheduled_date` (DATE), `scheduled_time` (TIME)
   - `assigned_to` (TEXT)
   - `status` (TEXT) - pending | completed | missed | snoozed | skipped
   - `outcome`, `outcome_notes` (TEXT)
   - `completed_at`, `snoozed_until` (TIMESTAMPTZ)
   - `reschedule_count` (INTEGER)

4. Create `kit_touch_methods` table (Control Panel configurable)

5. Create `kit_outcomes` table (Control Panel configurable)

6. Alter entity tables:
   - `ALTER TABLE leads ADD COLUMN kit_subscription_id UUID, kit_status TEXT`
   - `ALTER TABLE customers ADD COLUMN kit_subscription_id UUID, kit_status TEXT`
   - `ALTER TABLE professionals ADD COLUMN kit_subscription_id UUID, kit_status TEXT`

7. Enable RLS policies:
   - All authenticated users can read kit_presets (active ones)
   - Admin-only for creating/editing presets
   - Users can manage subscriptions for their assigned entities
   - Users can update touches for their assigned subscriptions

8. Enable realtime for `kit_touches` table

**Files to Create:**
- `src/hooks/useKitPresets.ts` - CRUD operations for presets (admin)
- `src/hooks/useKitSubscriptions.ts` - Subscription management
- `src/hooks/useKitTouches.ts` - Touch scheduling, completion, snooze
- `src/constants/kitConstants.ts` - Default methods, outcomes, colors

---

### Phase 2: Profile Tab Integration

**Components to Create:**

1. `src/components/kit/KitProfileTab.tsx`
   - Main tab component for entity profile views
   - States: Inactive, Active, Paused
   - Shows current subscription progress, upcoming touch, history

2. `src/components/kit/KitActivationDialog.tsx`
   - Preset selector dropdown
   - Preview of touch sequence
   - Cycle configuration (max cycles)
   - Assignee selection

3. `src/components/kit/KitTouchCard.tsx`
   - Display individual touch with method icon, date, assignee
   - Action buttons: Mark Complete, Snooze, Reschedule

4. `src/components/kit/KitTouchCompleteDialog.tsx`
   - Outcome selector (Connected, Not Reachable, Callback, etc.)
   - Notes textarea
   - Snooze/Reschedule options for incomplete outcomes

5. `src/components/kit/KitProgressIndicator.tsx`
   - Visual cycle progress (Step X of Y, Cycle X of Y)

6. `src/components/kit/KitPauseDialog.tsx`
   - Pause reason input
   - Auto-resume date picker

**Files to Modify:**

- `src/components/leads/LeadDetailView.tsx`:
  - Add "Keep in Touch" tab with HeartHandshake icon
  - Import and render `KitProfileTab` component

- `src/components/customers/CustomerDetailView.tsx`:
  - Add "Keep in Touch" tab
  - Import and render `KitProfileTab` component

- `src/components/professionals/EnhancedProfessionalTable.tsx`:
  - Add professional detail view with KIT tab (create ProfessionalDetailView if needed)

---

### Phase 3: Dashboard Widget & Calendar Integration

**Dashboard Widget:**

Create `src/components/dashboard/KitDashboardWidget.tsx`:
- Sections: Due Now, Overdue, Upcoming
- Shows entity name, method icon, preset name, due time
- Quick "Log" button to open completion dialog
- "View All" link to filtered calendar view

Create `src/hooks/useKitDashboard.ts`:
- Fetch today's touches across all subscriptions
- Filter by assigned_to for current user (or all for admin)
- Group by status (due, overdue, upcoming)

**Modify Dashboard:**
- `src/pages/Index.tsx`: Add KitDashboardWidget to dashboard grid

**Calendar Integration:**

Modify `src/hooks/useCalendarEvents.ts`:
- Add `kit_touch` as a new CalendarEventType
- Fetch kit_touches within date range
- Transform to CalendarEvent format with distinct color (e.g., purple)

Modify `src/components/calendar/CalendarEventCard.tsx`:
- Handle `kit_touch` event type
- Click to open entity profile's KIT tab

---

### Phase 4: Admin Preset Management

**Components to Create:**

1. `src/components/kit/presets/KitPresetList.tsx`
   - Table of all presets with name, sequence summary, status
   - Add/Edit/Delete actions

2. `src/components/kit/presets/KitPresetEditor.tsx`
   - Name, description inputs
   - Touch sequence builder
   - Cycle behavior selector

3. `src/components/kit/presets/KitTouchSequenceBuilder.tsx`
   - Drag-drop reorderable list
   - Add touch button
   - Per-touch: method selector, interval days input, assigned_to type

**Settings Integration:**

Modify `src/pages/Settings.tsx`:
- Add new "Keep in Touch" tab (admin only)
- Render `KitPresetList` component

**Control Panel Integration:**

Modify `src/hooks/useControlPanelSettings.ts`:
- Add "kit" module with fields:
  - `touch_methods`: call, whatsapp, visit, email, meeting
  - `outcomes`: connected, not_reachable, callback, invalid, positive

Modify `src/components/settings/ControlPanel.tsx`:
- Add KIT module icon and accordion section

---

### Phase 5: Bulk Actions & Advanced Features

**Bulk Activation:**

Create `src/components/kit/KitBulkActivateDialog.tsx`:
- Entity count display
- Preset selector
- Cycle configuration
- Confirm button

Modify table components to add bulk action:
- `src/components/leads/EnhancedLeadTable.tsx`
- `src/components/customers/EnhancedCustomerTable.tsx`
- `src/components/professionals/EnhancedProfessionalTable.tsx`

**Activity Log Integration:**

Modify `src/constants/activityLogConstants.ts`:
- Add new activity types:
  - `kit_activated`
  - `kit_touch_completed`
  - `kit_paused`
  - `kit_resumed`
  - `kit_cycle_completed`
  - `kit_cancelled`

Modify `src/hooks/useActivityLog.ts`:
- Support logging KIT activities to entity timeline

---

## File Structure Summary

```
src/
├── components/
│   ├── kit/
│   │   ├── KitProfileTab.tsx
│   │   ├── KitActivationDialog.tsx
│   │   ├── KitTouchCard.tsx
│   │   ├── KitTouchCompleteDialog.tsx
│   │   ├── KitProgressIndicator.tsx
│   │   ├── KitPauseDialog.tsx
│   │   ├── KitBulkActivateDialog.tsx
│   │   └── presets/
│   │       ├── KitPresetList.tsx
│   │       ├── KitPresetEditor.tsx
│   │       └── KitTouchSequenceBuilder.tsx
│   ├── dashboard/
│   │   └── KitDashboardWidget.tsx (new)
├── hooks/
│   ├── useKitPresets.ts (new)
│   ├── useKitSubscriptions.ts (new)
│   ├── useKitTouches.ts (new)
│   └── useKitDashboard.ts (new)
├── constants/
│   └── kitConstants.ts (new)
```

---

## Key Business Logic

### Touch Scheduling Algorithm
```
1. On KIT activation:
   - Create kit_subscription with status='active'
   - For each touch in preset.touch_sequence:
     - Calculate scheduled_date = prev_date + interval_days
     - Create kit_touches record (status='pending')
   - Update entity with kit_subscription_id, kit_status='active'

2. On touch completion:
   - Update kit_touches with outcome, notes, completed_at
   - Log activity to entity timeline
   - If outcome requires followup (snooze/reschedule):
     - Update snoozed_until or shift scheduled dates
   - Increment subscription.current_step
   - If last touch: trigger cycle completion flow

3. On cycle completion:
   - If auto_repeat: create new touches for next cycle
   - If user_defined: prompt user
   - If one_time: set subscription.status='completed'
```

### Auto-Reschedule Logic
```
- Scheduled job or on-access check for overdue touches
- If overdue > 24 hours:
  - Reschedule to next business day
  - Increment reschedule_count
  - Send notification to assignee
```

---

## Database Indexes (Performance)

```sql
CREATE INDEX idx_kit_touches_scheduled ON kit_touches(scheduled_date, status);
CREATE INDEX idx_kit_touches_subscription ON kit_touches(subscription_id);
CREATE INDEX idx_kit_subscriptions_entity ON kit_subscriptions(entity_type, entity_id);
CREATE INDEX idx_kit_subscriptions_status ON kit_subscriptions(status);
```

---

## Testing Checklist

After implementation:
- [ ] Admin can create/edit/delete KIT presets in Settings
- [ ] User can activate KIT on a Lead from profile's KIT tab
- [ ] User can activate KIT on a Customer from profile's KIT tab
- [ ] Touch scheduling creates correct dates based on intervals
- [ ] Touch completion logs outcome and advances to next touch
- [ ] Snooze/reschedule updates touch dates correctly
- [ ] Dashboard widget shows today's due and overdue touches
- [ ] Calendar displays KIT touches with correct color
- [ ] Clicking calendar KIT event opens entity profile
- [ ] Pause/resume functionality works with auto-resume
- [ ] Activity log shows KIT activities on entity timeline
- [ ] Bulk activation works from filtered table view
- [ ] Control Panel allows customizing methods and outcomes

---

## Estimated Implementation Effort

| Phase | Description | Complexity |
|-------|-------------|------------|
| Phase 1 | Database + Base Hooks | Medium |
| Phase 2 | Profile Tab Integration | Medium-High |
| Phase 3 | Dashboard + Calendar | Medium |
| Phase 4 | Admin Preset Management | Medium |
| Phase 5 | Bulk Actions + Polish | Low-Medium |

**Total: ~15-20 distinct file changes/creations**

