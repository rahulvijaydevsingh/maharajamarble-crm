

## Fix Plan: KIT Widget, Reminders Bell, and Edge Function Build Errors

### Issue 1 — KIT Widget "Unknown" entities

**File: `src/hooks/useKitDashboard.ts`** (lines 64-74)

Change the entity lookup to skip touches where the entity no longer exists:
- If `entity` is null after the query, `continue` (skip this touch)
- In the `catch` block, also `continue`

### Issue 2 — Reminders Bell (3 bugs)

**Bug 2A — Badge count staleness** (`src/components/shared/NotificationDropdown.tsx`)
- Add `const [, forceUpdate] = useState(0)` + a 60-second `setInterval` to force re-render

**Bug 2B — Reminders not filtered by user** 
- `src/hooks/useReminders.ts`: Add optional 3rd param `assignedTo?: string`. When provided (and no entityType/entityId), add `.eq("assigned_to", assignedTo)` to the query. Also filter realtime INSERTs by assignedTo.
- `src/components/shared/NotificationDropdown.tsx`: Get `profile` from `useAuth()`, pass `profile?.full_name` as 3rd arg to `useReminders(undefined, undefined, profile?.full_name)`

**Bug 2C — Case-insensitive entity_type** 
- In `NotificationDropdown.tsx` `handleReminderClick`: use `.toLowerCase()` on all entity_type checks
- In `RemindersWidget.tsx` `handleReminderClick`: same fix

**Data check**: Query confirms all current reminders have `entity_type = 'professional'` (lowercase), so Bug 2C is a safety net, not an active issue.

### Issue 3 — Edge Function Build Errors (13 TS errors)

**Root cause**: `createClient` without generic type params creates a client typed as `SupabaseClient<unknown, ...>`, making all `.from()` calls return `never` types for insert/update/select.

**Fix in `supabase/functions/run-automations/index.ts`**:
- Change `createClient(supabaseUrl, serviceRoleKey)` → `createClient<any>(supabaseUrl, serviceRoleKey)` (line 443)
- Change `executeAction` param type from `ReturnType<typeof createClient>` → `any` (line 168)
- Change `resolveProfileByNameOrEmail` param type similarly (line 145)
- This eliminates all 11 type errors in this file

**Fix in `supabase/functions/log-login/index.ts`** (line 107):
- `e.message` → `(e as Error).message`

**Fix in `supabase/functions/hr-generate-salary/index.ts`** (line 222):
- `err.message` → `(err as Error).message`

### Files Changed

| # | File | Change |
|---|------|--------|
| 1 | `src/hooks/useKitDashboard.ts` | Skip deleted entities |
| 2 | `src/hooks/useReminders.ts` | Add assignedTo filter param |
| 3 | `src/components/shared/NotificationDropdown.tsx` | Force re-render interval + user filter + case-insensitive checks |
| 4 | `src/components/dashboard/RemindersWidget.tsx` | Case-insensitive entity_type checks |
| 5 | `supabase/functions/run-automations/index.ts` | Fix TS types with `createClient<any>` |
| 6 | `supabase/functions/log-login/index.ts` | Cast error to Error |
| 7 | `supabase/functions/hr-generate-salary/index.ts` | Cast error to Error |

