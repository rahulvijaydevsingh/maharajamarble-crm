# Fix Plan: Login Logging, Task Dropdowns, KIT RLS Error  
other events by the staff are also not being logged. Mandeep created a KIT for a lead and it was not logged as well. 

## Issue 1: Login Activity Still Not Logging (4th Attempt - Bulletproof Fix)

### Root Cause

After extensive debugging across 4 attempts, the Supabase JS client insert after `signInWithPassword` never reaches the database (confirmed via postgres logs showing zero queries to `staff_activity_log` during login). Despite the code looking correct, some internal client SDK timing issue prevents the authenticated insert from executing properly right after sign-in.

### Solution: Dedicated Edge Function with Service Role

Bypass the client-side Supabase SDK entirely. Create a small edge function `log-login` that:

- Accepts user info (user_id, email, user_agent)
- Uses the SERVICE_ROLE key to insert directly (no RLS dependency)
- Is called via `supabase.functions.invoke('log-login', { body: {...} })` from the `signIn()` function
- The function validates the JWT to confirm the caller is authenticated

This approach is 100% reliable because:

- No dependency on client SDK auth header timing
- Service role bypasses all RLS
- Edge functions work independently of component lifecycle
- `functions.invoke` uses the current session token automatically

**Files:**

- Create `supabase/functions/log-login/index.ts`
- Modify `src/contexts/AuthContext.tsx` -- replace the direct `supabase.from().insert()` with `supabase.functions.invoke('log-login', ...)`

---

## Issue 2: Task Entry Form Dropdowns Not Visible (Z-Index)

### Root Cause

`AddTaskDialog` uses `DialogContent` with `z-[100]` and `hideOverlay`. The `SelectContent` dropdowns inside don't have an explicit z-index, so they render behind or at the same level as the dialog, making them invisible or see-through.

### Solution

Add `className="z-[200]"` to every `<SelectContent>` inside `AddTaskDialog.tsx`. There are 4 Select dropdowns (Templates, Task Type, Priority, Assign To) plus the date Popover that all need z-index fixes.

**File:** `src/components/tasks/AddTaskDialog.tsx`

- Line 386: `<SelectContent>` -> `<SelectContent className="z-[200]">`
- Line 419: `<SelectContent>` -> `<SelectContent className="z-[200]">`
- Line 442: `<SelectContent>` -> `<SelectContent className="z-[200]">`
- Line 460: `<SelectContent>` -> `<SelectContent className="z-[200]">`
- Line 496: `<PopoverContent>` -> add `className` with `z-[200]`

---

## Issue 3: KIT Activation Creates Tasks That Violate RLS

### Root Cause (Confirmed via postgres logs)

Error: `"new row violates row-level security policy for table 'tasks'"`

The tasks INSERT RLS policy requires: `is_admin() OR is_assigned_to_me(created_by)`

The function `is_assigned_to_me(value)` checks if the current user's `full_name` or `email` in the `profiles` table matches the provided value.

In `src/hooks/useTasks.ts` line 183:

```
created_by: task.created_by || "Current User"
```

When KIT creates tasks (in `KitProfileTab.tsx` lines 190-202), it calls `addTask({...})` without setting `created_by`. So `useTasks.ts` defaults it to the string `"Current User"`. 

For a field agent, `is_assigned_to_me("Current User")` returns false (no user has that name), and `is_admin()` also returns false. Result: RLS blocks the insert.

Admins never hit this because `is_admin()` passes regardless.

### Solution

Fix `useTasks.ts` to use the actual user email instead of "Current User". Import `useAuth` and use `user.email` as the default `created_by`.

Also fix the same issue in `KitProfileTab.tsx` -- pass the actual user email when calling `addTask`.

Additionally, fix `addReminder` calls from KIT to ensure `created_by` is set to the actual user email.

**Files:**

- `src/hooks/useTasks.ts` -- get user email from auth context, use as default `created_by`
- `src/components/kit/KitProfileTab.tsx` -- no changes needed if useTasks is fixed

---

## Implementation Order

1. Create `log-login` edge function and update AuthContext (login logging)
2. Fix `useTasks.ts` created_by default (KIT RLS error)
3. Add z-index to AddTaskDialog SelectContent elements (dropdown visibility)

## Files Summary


| File                                     | Action | Change                                                     |
| ---------------------------------------- | ------ | ---------------------------------------------------------- |
| `supabase/functions/log-login/index.ts`  | Create | Edge function to log login with service role               |
| `src/contexts/AuthContext.tsx`           | Modify | Replace direct insert with `functions.invoke('log-login')` |
| `src/hooks/useTasks.ts`                  | Modify | Default `created_by` to actual user email from auth        |
| `src/components/tasks/AddTaskDialog.tsx` | Modify | Add `z-[200]` to all `SelectContent` and `PopoverContent`  |
