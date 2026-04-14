

## Fix Plan: 4 Interconnected Issues

### Issue 1 — Notifications not showing (useNotifications.ts)

**Fix 1A** (line 55-59): Replace `const queryId = userEmail || userId` + `.eq("user_id", queryId)` with `.or()` filter that checks both UUID and email:
```
const orFilter = userEmail 
  ? `user_id.eq.${userId},user_id.eq.${userEmail}`
  : `user_id.eq.${userId}`;
// use .or(orFilter) instead of .eq("user_id", queryId)
```

**Fix 1B** (line 23): Change realtime filter to use UUID only: `filter: \`user_id=eq.${userId}\``

**Fix 1C** (lines 80-87): Same `.or()` fix in `useUnreadNotificationCount`

### Issue 2 — Approve Lost tasks not cleaned up (LeadDetailView.tsx)

**Fix 2A** (after line 295): Add a delayed cleanup `setTimeout` (2s) to cancel any remaining system-created tasks on the lead that were created async by the automation engine:
```typescript
setTimeout(async () => {
  await supabase.from('tasks')
    .update({ status: 'Cancelled', completion_notes: 'Auto-cancelled — Lead marked Lost' } as any)
    .eq('lead_id', currentLead.id)
    .eq('created_by', 'system')
    .not('status', 'in', '("Completed","Cancelled")');
}, 2000);
```

### Issue 3 — Automation fires twice (run-automations/index.ts)

**Fix 3** (lines 582-590): Replace hardcoded `execution_count: 1` with a read-then-increment pattern:
- Fetch existing tracking row's `execution_count`
- Upsert with `(existingCount || 0) + 1`

### Issue 4 — Snoozed reminders in bell count (NotificationDropdown.tsx)

**Fix 4** (line 43): Update `activeReminders` filter to exclude currently-snoozed reminders:
```typescript
const now = new Date();
const activeReminders = reminders
  .filter(r => !r.is_dismissed && (!r.is_snoozed || !r.snooze_until || new Date(r.snooze_until) <= now))
  .slice(0, 10);
```

### Files Changed

| File | Fix |
|------|-----|
| `src/hooks/useNotifications.ts` | .or() dual query + UUID realtime filter |
| `src/components/leads/LeadDetailView.tsx` | Delayed system-task cleanup on approve |
| `supabase/functions/run-automations/index.ts` | Increment execution_count properly |
| `src/components/shared/NotificationDropdown.tsx` | Filter out snoozed reminders |

Build verification with `tsc --noEmit` after all changes. Edge function redeployment for Issue 3.

