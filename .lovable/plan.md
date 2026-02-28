

# Comprehensive Fix: Staff Activity Logging, Automation Engine, and Notifications

## Root Cause Analysis

### Problem 1: Staff Activity Log Only Shows Login/Logout
**Two causes found:**
- **Missing coverage**: `logStaffAction()` is only called in 5 places (create_lead, create_task, create_customer, create_quotation, logout). Lead edits, status changes, deletes, task updates/completions, reminders, notes, KIT operations, and professional creates have NO logging calls.
- **The `delete_staff` entry that does appear** comes from an Edge Function (using SERVICE_ROLE), confirming client-side logging works in principle but is just not called broadly enough.

### Problem 2: Automation Engine Never Fires (Critical Bug)
**The database trigger function `notify_automation_engine()` calls `extensions.http_post()`** but the `pg_net` function actually lives at **`net.http_post()`**. The function silently fails in the EXCEPTION handler, so no HTTP call ever reaches the `run-automations` Edge Function. Additionally, the `body` parameter is passed as `text` but `net.http_post` requires `jsonb`.

### Problem 3: Notifications Invisible Even If Created
**The `notifications.user_id` column is TEXT type.** The automation engine stores the profile UUID (e.g., `372e9660-...`) as `user_id`. But:
- The RLS policy checks `user_id = get_current_user_email()` (which returns an email like `superadmin@demo.com`)
- The client hook `useNotifications` queries `.eq("user_id", user?.id)` where `user?.id` is the auth UUID
- For admins, `is_admin()` bypasses the RLS check, but the query filter still uses UUID
- **Result**: Even if notifications existed, the query filter and RLS would conflict for non-admin users

Also, the edge function has a **duplicate push bug** (line 176-177: `userIds.push(profile.id)` appears twice).

---

## Fix Plan

### Fix 1: Repair the Automation Trigger Function (Database Migration)
Update the `notify_automation_engine()` function to:
- Use `net.http_post()` instead of `extensions.http_post()`
- Pass `body` as `jsonb` instead of `text`

```sql
CREATE OR REPLACE FUNCTION public.notify_automation_engine()
RETURNS trigger ...
AS $$
  ...
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/run-automations',
    body := payload,  -- jsonb, not text
    headers := jsonb_build_object(...)
  );
  ...
$$;
```

### Fix 2: Fix Notification user_id Storage in Edge Function
In `supabase/functions/run-automations/index.ts`:
- Store the user's **email** as `user_id` in notifications (not their profile UUID), since the RLS policy and original design expect email
- Remove the duplicate `userIds.push(profile.id)` on line 176-177
- Change the notification insert to use email instead of profile.id

### Fix 3: Fix Notification Querying in Client
In `src/hooks/useNotifications.ts` and `src/components/shared/NotificationDropdown.tsx`:
- Query notifications by `user?.email` instead of `user?.id` since `user_id` stores email
- Update the realtime subscription filter accordingly

### Fix 4: Add Comprehensive Staff Activity Logging
Add `logStaffAction()` calls to these operations that currently lack them:

| Operation | File | Action Type |
|-----------|------|-------------|
| Lead edited | `src/components/leads/LeadDetailView.tsx` (`handleSaveEdit`) | `update_lead` |
| Lead deleted | `src/pages/Leads.tsx` (delete handler) | `delete_lead` |
| Lead status change | `src/hooks/useLeads.ts` (`updateLead` when status changes) | `update_lead` |
| Task updated | `src/hooks/useTasks.ts` (`updateTask`) | `update_task` |
| Task completed | `src/hooks/useTasks.ts` (`updateTask` with completed_at) | `complete_task` |
| Reminder created | `src/hooks/useReminders.ts` (`addReminder`) | `create_reminder` |
| Reminder dismissed | `src/hooks/useReminders.ts` (`dismissReminder`) | `dismiss_reminder` |
| Note added | `src/components/leads/detail-tabs/LeadNotesTab.tsx` | `add_note` |
| Professional created | `src/components/professionals/AddProfessionalDialog.tsx` | `create_professional` |
| KIT activated | `src/components/kit/KitProfileTab.tsx` | `activate_kit` |

Since `logStaffAction` in `useStaffActivityLog` requires the hook context, and hooks like `useTasks.ts` already use `useAuth`, I will add direct Supabase inserts (using the same pattern as the existing hook) within these data hooks to avoid circular dependencies.

### Fix 5: Expand StaffActivityPanel Display
Update `src/components/settings/StaffActivityPanel.tsx` to:
- Add labels/colors for all new action types (update_lead, delete_lead, complete_task, create_reminder, dismiss_reminder, add_note, create_professional, activate_kit)
- Add a date range filter (Today / Last 7 days / Last 30 days / All time)

---

## Files to Modify

| File | Change |
|------|--------|
| Database migration | Fix `notify_automation_engine()`: `net.http_post` + jsonb body |
| `supabase/functions/run-automations/index.ts` | Store email as notification user_id; fix duplicate push |
| `src/hooks/useNotifications.ts` | Query by `user?.email` instead of `user?.id` |
| `src/components/shared/NotificationDropdown.tsx` | Pass email to notification hooks |
| `src/hooks/useStaffActivityLog.ts` | Add a standalone `logToStaffActivity()` helper that doesn't need hooks |
| `src/hooks/useTasks.ts` | Add activity logging for task update/complete/delete |
| `src/hooks/useLeads.ts` | Add activity logging for lead update/delete |
| `src/hooks/useReminders.ts` | Add activity logging for reminder create/dismiss |
| `src/components/leads/LeadDetailView.tsx` | Add logStaffAction for lead edits |
| `src/components/kit/KitProfileTab.tsx` | Add logStaffAction for KIT activation |
| `src/components/professionals/AddProfessionalDialog.tsx` | Add logStaffAction for professional create |
| `src/components/settings/StaffActivityPanel.tsx` | Add new action type labels + date filter |

## Implementation Order
1. Fix DB trigger function (migration) -- unblocks all automation
2. Fix edge function notification user_id + duplicate push
3. Fix notification client queries (email-based)
4. Add comprehensive activity logging across all hooks
5. Update StaffActivityPanel with new types and date filter

