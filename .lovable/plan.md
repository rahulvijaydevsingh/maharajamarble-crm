# Fix Plan: Todo List Error, Referred By Mock Data, and Login Logging

## Issue 1: Todo Lists Error on Refresh

**Root Cause:** The `useTodoLists` hook fires `fetchLists()` immediately on mount via `useEffect([], [])`. On page refresh, the auth session hasn't been restored yet when this query runs. The RLS policy on `todo_lists` requires `get_current_user_email()` (which depends on `auth.uid()`). If the JWT isn't ready, the query fails with an RLS error. The error is intermittent because sometimes the session restores fast enough.

**Fix:** Add an auth gate — only fetch todo lists when `supabase.auth.getSession()` confirms a valid session. Also suppress the error toast for transient auth-related failures.

**File:** `src/hooks/useTodoLists.ts`

- Import `useAuth` from AuthContext
- Gate `fetchLists()` on `user` being non-null
- Add `user` to the useEffect dependency array so it re-fetches once auth is ready
- Check for "JWT" or "row-level security" in error messages and skip showing destructive toasts for those

---

## Issue 2: Referred By Shows Fake Professionals

**Root Cause:** `src/components/leads/smart-form/SourceRelationshipSection.tsx` imports and uses `MOCK_PROFESSIONALS` from `src/constants/leadConstants.ts` — a hardcoded list of fake professionals like "Architect Ramesh Kumar" that don't exist in the database. The real professionals are in the `professionals` table.

**Fix:** Replace `MOCK_PROFESSIONALS` with live data from the `useProfessionals` hook.

**File:** `src/components/leads/smart-form/SourceRelationshipSection.tsx`

- Remove the `MOCK_PROFESSIONALS` import
- Import `useProfessionals` from `@/hooks/useProfessionals`
- Call the hook and use `professionals` array
- Map the database professional fields (`name`, `firm_name`, `professional_type`, `phone`, `email`, `id`) to the format expected by the search UI
- Update the `filteredProfessionals` memo to filter from real data instead of mock data
- Handle loading state (show "Loading professionals..." in the search)  
keeping the UI of the drop down list same as the mock data for he original data.

Also used in `src/components/leads/bulk-upload/PhotoLeadForm.tsx` — same fix needed there if it references `MOCK_PROFESSIONALS`.

---

## Issue 3: Login Activity Still Not Logging (Root Cause Analysis)

**Root Cause — Deep Analysis:**

This is the 3rd attempt. Previous approaches:

1. Attempt 1: Direct insert in `Auth.tsx` after `signIn()` — failed because `useStaffActivityLog` hook's `user` guard was null
2. Attempt 2: Direct Supabase insert in `Auth.tsx` — failed due to navigating away before async insert completed
3. Attempt 3 (current): Insert via `onAuthStateChange` in `AuthContext.tsx` with `loginPendingRef` and `setTimeout(500)` — still failing

**Why it keeps failing:** The `onAuthStateChange` callback with `setTimeout` is unreliable because:

- The `SIGNED_IN` event may fire at a point where the supabase client's internal state is transitional
- The `setTimeout` callback runs in a different microtask context where the authenticated request may not propagate correctly
- There are potential double-fire scenarios where `loginPendingRef` gets cleared prematurely

**The bulletproof fix:** Move login logging directly INTO the `signIn()` function, AFTER `signInWithPassword` resolves with a valid session. At that point:

- `data.session` is confirmed valid (returned by the function)
- The supabase client has already stored the JWT internally
- `auth.uid()` on the database side will match `data.session.user.id`
- No setTimeout, no ref flags, no timing dependencies

Since `staff_activity_log` IS in the generated TypeScript types (confirmed at line 1817 of types.ts), we can drop ALL `as any` casts and use properly typed calls.

**File:** `src/contexts/AuthContext.tsx`

Changes to `signIn()`:

```text
const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (!error && data.session) {
    // Log login IMMEDIATELY — session is confirmed valid
    try {
      const { error: logError } = await supabase
        .from("staff_activity_log")
        .insert([{
          user_id: data.session.user.id,
          user_email: data.session.user.email || email,
          action_type: "login",
          action_description: `User logged in: ${email}`,
          entity_type: "auth",
          metadata: { user_agent: navigator.userAgent },
          user_agent: navigator.userAgent,
        }]);
      
      if (logError) {
        console.error("Login log insert failed:", logError);
      }
    } catch (e) {
      console.error("Login logging error:", e);
    }
  }
  
  return { error };
};
```

Also:

- Remove the `loginPendingRef` ref entirely
- Remove the `SIGNED_IN` login logging block from `onAuthStateChange`
- Keep the rest of `onAuthStateChange` unchanged (it still handles `fetchUserData`, etc.)

---

## Files to Modify


| File                                                            | Change                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contexts/AuthContext.tsx`                                  | Move login logging into `signIn()` after `signInWithPassword` resolves; remove `loginPendingRef` and the `SIGNED_IN` logging block from `onAuthStateChange` |
| `src/hooks/useTodoLists.ts`                                     | Gate fetch on auth state being ready; suppress transient RLS error toasts                                                                                   |
| `src/components/leads/smart-form/SourceRelationshipSection.tsx` | Replace `MOCK_PROFESSIONALS` with live `useProfessionals` data                                                                                              |


## Implementation Order

1. Login logging fix (most critical, third attempt)
2. Referred By mock data replacement
3. Todo list refresh error suppression