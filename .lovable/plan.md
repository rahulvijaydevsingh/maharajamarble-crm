

# Fix Plan: Task Form Dropdown, Login Visibility, and Automation Engine

## Issue 1: Related To Dropdown Not Working in Task Form

**Root Cause:** The `RelatedEntitySection` component uses `z-[80]` on its `SelectContent` (line 159) and `PopoverContent` (line 190), but the parent `AddTaskDialog` renders at `z-[100]`. The dropdowns appear behind the dialog.

**Fix:** Change `z-[80]` to `z-[200]` on both elements in `src/components/tasks/form/RelatedEntitySection.tsx`.

**File:** `src/components/tasks/form/RelatedEntitySection.tsx` (2 line changes)

---

## Issue 2: Login Activity Not Visible to User

**Root Cause:** Login IS being logged successfully -- confirmed 2 entries in the database for mandeep@maharajamarble.com. However, the `staff_activity_log` table's SELECT RLS policy only allows `is_admin()`. Mandeep has the `field_agent` role, so they cannot see any activity log entries.

**Fix Options:**
- A: Add a policy so users can view their own activity: `user_id = auth.uid()` (recommended -- lets each user see their own login history)
- B: Inform the user this is admin-only by design

**Recommended:** Add a new SELECT policy so users can see their own entries. This way field agents can verify their own login was recorded, while only admins see everyone's activity.

**Migration:** Add RLS policy `Users can view own activity` with `user_id = auth.uid()` for SELECT.

---

## Issue 3: Workflow Automation Not Triggering (Critical)

**Root Cause:** The automation system has NO execution engine. The entire codebase only contains:
- UI for creating/editing automation rules
- Database tables for storing rules and execution logs
- But ZERO runtime code that evaluates triggers or executes actions

No database trigger, no edge function, and no frontend listener watches for data changes to match against automation rules. The rules are inert configurations.

### Solution: Build an Automation Engine Edge Function

Create a `run-automations` edge function that:
1. Is triggered by database changes via a Postgres trigger (on INSERT/UPDATE to `staff_activity_log`, `leads`, `tasks`, `customers`, `professionals`, `quotations`)
2. Fetches active automation rules matching the entity type
3. Evaluates trigger conditions against the new/changed row
4. Executes matching actions (create task, send notification, etc.)
5. Logs execution results to `automation_executions`

### Architecture

```text
Data Change (INSERT/UPDATE)
        |
        v
  DB Trigger Function
  (notify_automation_engine)
        |
        v
  pg_net HTTP call to
  run-automations edge function
        |
        v
  Edge Function:
  1. Fetch active rules for entity_type
  2. Evaluate trigger conditions
  3. Execute actions (insert tasks, notifications, etc.)
  4. Log execution to automation_executions
```

### Implementation Details

**Database Migration:**
- Create a `notify_automation_engine()` Postgres function that uses `pg_net` (already available in Supabase) to call the edge function
- Create triggers on key tables: `staff_activity_log`, `leads`, `tasks`, `customers`, `professionals`
- The trigger fires AFTER INSERT OR UPDATE and passes the new row data

**Edge Function (`supabase/functions/run-automations/index.ts`):**
- Receives: `{ entity_type, entity_id, operation, new_row, old_row }`
- Uses SERVICE_ROLE to bypass RLS for reading rules and executing actions
- Condition evaluation logic:
  - `field_change` trigger: checks if field matches value, changed to value, etc.
  - `field_matches` trigger: checks current field state against condition
  - Supports AND/OR condition logic
- Action execution:
  - `send_notification`: inserts into `notifications` table
  - `create_task`: inserts into `tasks` table
  - `create_reminder`: inserts into `reminders` table
  - `update_field`: updates the source entity record
- Logs all results to `automation_executions`

**Supported trigger types for initial release:**
- `field_change` with operators: `equals`, `not_equals`, `contains`, `changes_to`
- Multi-condition support with AND/OR logic

**Supported actions for initial release:**
- `send_notification` (in-app)
- `create_task`
- `create_reminder`
- `update_field`

### Specific Rule Test Case
The existing rule "mandeep login alert" will work because:
- Entity type: `staff_activity` maps to `staff_activity_log` table
- Trigger: field_change where `user_email equals mandeep@maharajamarble.com` AND `action_type changes_to login`
- Action: send_notification to `superadmin@demo.com`
- When Mandeep logs in, the `log-login` edge function inserts into `staff_activity_log`, the DB trigger fires, calls `run-automations`, which evaluates the rule and creates a notification

---

## Files Summary

| File | Action | Change |
|------|--------|--------|
| `src/components/tasks/form/RelatedEntitySection.tsx` | Modify | Change `z-[80]` to `z-[200]` on SelectContent and PopoverContent |
| `supabase/functions/run-automations/index.ts` | Create | Automation execution engine edge function |
| Database migration | Create | Add `notify_automation_engine()` function and triggers on key tables; add user self-view RLS policy on `staff_activity_log` |

## Implementation Order

1. Fix RelatedEntitySection z-index (quick fix)
2. Add staff_activity_log self-view RLS policy
3. Create the `run-automations` edge function
4. Add database triggers to invoke the engine
5. Test with the existing "mandeep login alert" rule

