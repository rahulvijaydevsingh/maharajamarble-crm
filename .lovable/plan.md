## Investigation findings (verified against current code & DB)

### ISSUE 1 — Lost task cancellation incomplete ✅ confirmed

`LeadDetailView.handleApproveLost` (lines 295–315) sweeps with `.eq('lead_id', leadId)`. The "Approve Lost Request" task (created by automation rule `f824a0f5…`) IS linked via `lead_id` (verified in DB), so the sweep should catch it. BUT: the rule has `link_to_trigger: true` on `create_task`, and timing matters — automation runs every ~60s, so the approval task may be created AFTER `handleMarkAsLost` runs and even AFTER `handleApproveLost`. The 800ms second-pass is insufficient. Also: `markAsLost` (`handleMarkAsLost`) does **not** sweep tasks at all; only approval does. We need to also sweep on `**pending_lost**` transition AND on `lost` approval, and the sweep must additionally cover `related_entity_type='lead' AND related_entity_id=leadId` for safety.

### ISSUE 2 — Duplicate "Approve Lost Request" task

DB check shows only 2 rows total (one per lead), so no actual duplicate currently. No direct `addTask` for this title exists in code (`rg` returned no matches). The perceived "double" is likely the same task appearing in both the lead's tasks tab AND task management — not a real duplicate. **No code change needed**; document and move on.

### ISSUE 3 — Approval task assigned to wrong person ✅ confirmed

Rule `f824a0f5…` config: `assigned_to_type: "trigger.created_by"`. The `run-automations` engine (lines 280–290) handles only `trigger.assigned_to` and `specific_user`; `trigger.created_by` falls through to the default branch which uses `newRow.assigned_to` (the lead's assignee — Mandeep, Bulk Import, etc.). Two-part fix:

- **Code:** Add an explicit `trigger.created_by` case in `run-automations/index.ts` (both create_task and create_reminder paths).
- **Data:** Update rule `f824a0f5…` to use `assigned_to_type: "specific_user"` with `assigned_to_user: "Nipun Tantia"` (full_name, per the staff-identity rule) so the approval task always goes to admin regardless of the trigger creator.

### ISSUE 4 — Snoozed reminder bell never fires ✅ partially confirmed

`syncTaskReminder` (useTasks.ts L323-327): when snooze provides `overrides.fireAt`, the row is only inserted if `isFuture === true`. A 15-min snooze is future, so the row IS written. The real gap is in `useReminders.ts`:

- Polling already runs at 60s (good).
- Realtime INSERT handler (L228-232) only adds to bell list if `isDue` at insert time — for a future snooze (15 min ahead), it is NOT due yet, so it is skipped. When 15 min passes, only the next poll catches it. That should work… UNLESS the user is on a tab without focus and polling is throttled, OR the reminder was inserted but `assigned_to` doesn't match `profile.full_name` (NotificationDropdown filters by `profile?.full_name` — if `task.assigned_to` is an email, the filter excludes it).
- `syncTaskReminder` writes `assigned_to: task.assigned_to || 'System'` — for legacy tasks where assigned_to is an email, the bell silently filters out that reminder. **This is the root cause.**

Fix:

- In `syncTaskReminder`, normalize `task.assigned_to` → resolve email/UUID to full_name via `profiles` lookup before writing the reminder row (cached lookup, try/catch).
- Add a mount-time **catch-up query** in `useReminders` that fetches reminders where `reminder_datetime` is within the last 5 minutes and not yet in state, so missed-poll cases recover.

### ISSUE 5 — Double call log on mobile ✅ already fixed

`PhoneLink.tsx` has the `isLoggingRef` guard with 3-second reset in `finally`. Verified correct. No action.

### ISSUE 6 — PR #68 verification

- 6a Header.tsx L92-93: lost leads route to `/leads?archive=true&leadId=…` ✅
- 6b LeadArchive.tsx L106-116: reads `leadId`, opens dialog, deletes param ✅
- 6c PhoneLink guard ✅
**No fixes needed.**

### ISSUE 7 — PR #67 verification

- 7a Professional types — will spot-check `professionalConstants.ts`.
- 7b LeadArchive Activity History tab — will spot-check.
- 7c SmartLeadForm reminder ✅ confirmed (lines 115, 240–241, 412–415; `Leads.tsx` writes the reminder row).
- 7d Edit forms must NOT create reminders — will verify and remove `addReminder` if present.
Any gaps found will be patched.

---

## Plan

### 1. Fix lost-lead task cancellation sweep

File: `src/components/leads/LeadDetailView.tsx`

- Add a sweep inside `handleMarkAsLost` (pending_lost transition): cancel all open tasks for the lead, both via `lead_id` AND `related_entity_type='lead' AND related_entity_id=leadId`. Wrap in try/catch.
- Replace `handleApproveLost`'s 800ms second-pass with a longer (3s) wait AND a unified sweep that also covers `related_entity_id`. Keep first immediate sweep.
- Both sweeps must NOT cancel "Re-engagement opportunity" (filter by title NOT LIKE).

### 2. Fix automation engine to support `trigger.created_by`

File: `supabase/functions/run-automations/index.ts`

- In both create_task (L280-290) and create_reminder (L352-361) assignment branches, add explicit case `trigger.created_by` → uses `newRow.created_by`.
- Redeploy function.

### 3. Reassign the "Approve Lost Request" rule to admin

SQL migration to update `automation_rules` row `f824a0f5-9acd-41df-b9d6-40e038f98c0d`:

- Change the create_task action's config to `assigned_to_type: "specific_user"`, `assigned_to_user: "Nipun Tantia"` (full_name).

### 4. Fix snooze/reminder bell visibility

File: `src/hooks/useTasks.ts` (`syncTaskReminder`)

- Before writing the reminder row, resolve `task.assigned_to` to a full_name via `profiles` (handle email → name; if already a name, pass through). Try/catch; fallback to existing value.

File: `src/hooks/useReminders.ts`

- Add a mount-time catch-up: fetch reminders due in the last 10 minutes (assigned to current user, not dismissed) and merge into state — ensures snoozes that fired between polls show on next page load.
- Realtime INSERT handler: for the bell mode (`!entityType`), add a `setTimeout` to re-check at `reminder_datetime - now` for future inserts so they appear at fire time even if poll is throttled.

### 5. PR #67 verifications & gap patches

- Read `professionalConstants.ts`, `LeadArchive.tsx` (Activity tab), `EditSmartLeadForm`, `EditSmartCustomerForm`. Patch any missing piece.

### 6. Constraints honored

- All identity writes use full_name strings.
- All reminder/task side effects wrapped in try/catch.
- No new realtime channels (extend existing).
- No schema/RLS changes.

### Out of scope (per user's "leave this")

- Adding professional individuals to professional entry form.
- Adding reminder UI to BulkUploadDialog.  
  
  
Plan Item 1 — Task Cancellation Sweep: The "Re-engagement Opportunity" Exclusion is Risky
  Lovable plans to filter by `title NOT LIKE 'Re-engagement%'`. This is fragile — if the automation task title ever changes, the filter breaks silently and starts cancelling Re-engagement tasks.
  **Better approach:** Filter by timing, not title. The sweep in `handleMarkAsLost` (pending_lost transition) runs synchronously. The Re-engagement Opportunity is created by automation which runs every ~60s AFTER the status change. So there is a natural timing gap — the Re-engagement task doesn't exist yet when the sweep runs.
  **Instruction to append:**
  ```
  In Plan Item 1, remove the title-based exclusion filter 
  (NOT LIKE 'Re-engagement%'). Instead, rely on timing: 
  the sweep in handleMarkAsLost runs synchronously at the 
  moment of status change. The Re-engagement Opportunity 
  task is created by the automation engine 60+ seconds 
  later — it cannot exist yet. No title filter needed.

  For the handleApproveLost sweep, same logic applies — 
  the Re-engagement task is created by automation AFTER 
  approval, not before. So both sweeps are naturally safe.

  Only exception: if a Re-engagement task somehow exists 
  from a PREVIOUS re-engagement cycle on this same lead. 
  Guard against this by filtering: status NOT IN 
  ('Completed', 'Cancelled') AND created_at < NOW(). 
  This is already implied by the sweep targeting open tasks.
  ```
  ---
  #### Plan Item 2 — Edge Function Redeploy Must Be Explicit
  Lovable says "redeploy function" but this is easy to forget. Make it a hard gate.
  **Instruction to append:**
  ```
  In Plan Item 2, after modifying run-automations/index.ts, 
  Lovable must add a visible reminder in the PR description:

  "⚠️ MANUAL STEP REQUIRED AFTER MERGE: Redeploy the 
  run-automations edge function in Supabase Dashboard → 
  Edge Functions → run-automations → Deploy. The code 
  change has zero effect until this is done."

  The PR must NOT be considered complete until this step 
  is confirmed by Nipun.
  ```
  ---
  #### Plan Item 3 — SQL Migration for Automation Rule: Needs Validation First
  Lovable plans to write a SQL migration changing rule `f824a0f5…` to `specific_user` with `assigned_to_user: "Nipun Tantia"`. One risk: if the exact string `"Nipun Tantia"` doesn't match the `full_name` in the `profiles` table exactly (could be `"Admin - Nipun Tantia"` or similar), the assignment silently assigns to nobody or throws.
  **Instruction to append:**
  ```
  In Plan Item 3, before writing the SQL migration, 
  Lovable must first run this query to confirm the exact 
  full_name string:

    SELECT full_name FROM profiles 
    WHERE email ILIKE '%nipun%' OR full_name ILIKE '%nipun%' 
    LIMIT 3;

  Use the exact returned value (character-for-character) 
  as the assigned_to_user value in the migration. Do not 
  assume "Nipun Tantia" — use whatever the DB returns.
  ```
  ---
  #### Plan Item 4 — assigned_to Resolution: Cache the Lookup
  Lovable plans to do a `profiles` lookup inside `syncTaskReminder` on every call. `syncTaskReminder` is called every time a task is added, updated, or snoozed — potentially dozens of times per session. An uncached DB round-trip per call is wasteful.
  **Instruction to append:**
  ```
  In Plan Item 4, the profiles lookup in syncTaskReminder 
  must be cached. Implement as a module-level Map:

    const profileNameCache = new Map<string, string>();

    async function resolveToFullName(value: string): Promise<string> {
      if (!value || value === 'System') return value;
      // Already looks like a name (contains space, no @)
      if (!value.includes('@') && value.includes(' ')) return value;
      if (profileNameCache.has(value)) return profileNameCache.get(value)!;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .or(`email.eq.${value},id.eq.${value}`)
          .maybeSingle();
        const name = data?.full_name || value;
        profileNameCache.set(value, name);
        return name;
      } catch { return value; }
    }

  Call: assigned_to = await resolveToFullName(task.assigned_to || 'System')
  This resolves emails and UUIDs correctly and only hits 
  the DB once per unique value per session.
  ```
  ---
  #### Plan Item 4 — useReminders setTimeout Approach: Reconsider
  Lovable plans to add a `setTimeout` in the realtime INSERT handler to re-check at `reminder_datetime - now` for future inserts. This is fragile — if the component unmounts before the timeout fires, it leaks. Also `setTimeout` inside a realtime handler is hard to clean up.
  **Instruction to append:**
  ```
  In Plan Item 4, for the useReminders realtime INSERT 
  handler, do NOT add a setTimeout inside the handler. 
  The 60-second poll already handles future reminders 
  correctly when they become due. The setTimeout approach 
  risks memory leaks on unmount and is unnecessary given 
  the existing poll.

  Instead, the only additions needed are:
  1. The mount-time catch-up query (already in plan — keep it)
  2. Ensure the poll query uses reminder_datetime <= now() 
     strictly (not < now()) so reminders due at exactly 
     the poll moment are not missed
  3. The assigned_to normalization fix (resolveToFullName)

  Remove the setTimeout from the plan entirely.
  ```
  ---
  #### Missing Item — Plan Item 7d (Edit Forms addReminder Audit)
  Lovable says it will "verify and remove addReminder if present" in EditSmartLeadForm and EditSmartCustomerForm. This needs to be explicit.
  **Instruction to append:**
  ```
  For Plan Item 5 (PR #67 verifications), for 7d:
  If addReminder calls exist in EditSmartLeadForm.tsx or 
  EditSmartCustomerForm.tsx submit handlers, remove them 
  entirely. The edit forms must ONLY:
  - Update the existing lead/customer record
  - Reschedule the existing task if dates changed
  They must never create new reminder rows. If the 
  reminder checkbox is checked and the user saves an edit, 
  nothing happens regarding reminders — the checkbox is 
  UI-only in edit mode.
  ```
  ---
  ### Summary — What to Tell Lovable
  Approve the plan with these modifications:
  ```
  The plan looks good. Please apply these changes before 
  implementing:

  1. Plan Item 1: Remove the title-based exclusion filter 
     for Re-engagement tasks. Rely on natural timing instead 
     — explained in the supplementary instructions from our 
     architect.

  2. Plan Item 2: Add a visible ⚠️ manual redeploy reminder 
     in the PR description for the edge function.

  3. Plan Item 3: Before writing the SQL migration, run 
     SELECT full_name FROM profiles WHERE full_name ILIKE 
     '%nipun%' LIMIT 3 and use the exact returned string 
     as assigned_to_user. Do not assume the name format.

  4. Plan Item 4 (syncTaskReminder): Cache the profiles 
     lookup in a module-level Map using the resolveToFullName 
     pattern provided. Do not do an uncached DB call per 
     invocation.

  5. Plan Item 4 (useReminders): Remove the setTimeout from 
     the realtime INSERT handler. Keep only the mount-time 
     catch-up query and the poll fix. setTimeout inside a 
     realtime handler risks memory leaks.

  6. Plan Item 5 / Issue 7d: If addReminder calls exist in 
     either edit form's submit handler, remove them entirely. 
     The reminder checkbox is UI-only in edit mode.

  All other items approved as written.
  ```