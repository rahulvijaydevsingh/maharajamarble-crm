
## Plan: Fix Task Creation Form Bug

### Root Cause

The `AddTaskDialog` form hardcodes `created_by: "Current User"` (line 276) in the task data sent to `addTask()`. 

In `useTasks.addTask()` (line 186), the logic is:
```
created_by: task.created_by || user?.email || "Current User"
```

Since `"Current User"` is a truthy string, it **never falls through** to `user?.email`. The task is inserted into the database with `created_by = "Current User"`.

The INSERT RLS policy is: `is_admin() OR is_assigned_to_me(created_by)`

The `is_assigned_to_me("Current User")` function checks the `profiles` table for a row where `full_name = 'Current User' OR email = 'Current User'` -- which never matches any real user. This causes an **RLS violation for all non-admin roles** (field agents, sales users, managers).

For admins, `is_admin()` returns true so the insert succeeds, but the `created_by` value is still wrong (stored as "Current User" instead of the actual user's email), which breaks downstream features like activity logs and task ownership queries.

### Fix

**File: `src/components/tasks/AddTaskDialog.tsx`**
- Remove the hardcoded `created_by: "Current User"` from the `taskData` object in `handleSubmit` (line 276). The `addTask()` hook already handles setting `created_by` from the authenticated user's email.

**File: `src/hooks/useTasks.ts`**  
- Tighten the fallback logic on line 186 to ignore placeholder values:
  ```
  created_by: (task.created_by && task.created_by !== "Current User") 
    ? task.created_by 
    : (user?.email || "unknown")
  ```

This is a two-line fix that resolves:
- Field agent RLS violation when creating tasks (including recurring tasks from presets)
- Incorrect `created_by` value for all users
- No other form logic or recurrence handling is affected
