## Multi-Part Fix Plan: Activity Logging, Automation Engine, and created_by Migration

This plan addresses 6 fixes from the reference document, broken into manageable parts.

---

### Part 1: Parent Task Activity History in Task Detail (FIX 1)

**File: `src/components/tasks/TaskDetailView.tsx**`

Currently the task detail panel shows a "Follow-up to: [parent title]" link (line 450-459) and loads parent task metadata in `loadChain` (line 217-235), but does NOT fetch or display the parent's activity log entries.

**Changes:**

- Add state: `parentActivityEntries` and `parentHistoryOpen`
- In the `loadChain` useEffect, after fetching parent task, also fetch `task_activity_log` entries for `parent_task_id`
- Render a collapsible section using the existing `Collapsible` component from `@/components/ui/collapsible` right below the "Follow-up to" link
- The collapsed section shows "Click to expand history — N events" as trigger
- When expanded, renders parent activity entries using the same `TaskActivityTimeline` component already used for the current task (line 590-596), but with dimmed styling

---

### Part 2: Enhanced Lead Timeline Logging (FIX 2)

**2A — Snooze logging in `src/hooks/useTasks.ts**` (line 429-464)

The `snoozeTask` function calls `updateTask` which logs to `activity_log` via `logActivity`, but only with generic "Task Snoozed" title. Add explicit `task_activity_log` insert for the snooze event after the `updateTask` call (line 454), with metadata including `snoozed_until`, `hours_added`, and `original_due_date`.

**2B — Follow-up creation logging in `src/components/tasks/TaskCompletionDialog.tsx**` (line 369-390)

After `const newTask = await addTask(nextTask)` (line 369), add a direct `activity_log` insert for the lead if `task.lead_id` exists, with type `task_created` and metadata linking parent/child task IDs. Currently only `logTaskActivity` is called (line 371) but no lead-specific follow-up creation log.

**2C — Outcome logging is already correct** (line 393-399)

The lead activity log for outcomes runs at line 394 regardless of `closeTask` — it's outside the `if (closeTask)` block. No change needed.

**2D — Follow-up task inherits `lead_id**` (line 357)

Already correct — `lead_id: task.lead_id` is set in `nextTask`. No change needed.

---

### Part 3: created_by Migration from Email to Name (FIX 4)

**Affected files (all `created_by: user?.email` writes):**


| File                                                 | Line     | Current                    | New                                           |
| ---------------------------------------------------- | -------- | -------------------------- | --------------------------------------------- |
| `src/pages/Leads.tsx`                                | 150      | `user?.email || "unknown"` | `user?.full_name || user?.email || "unknown"` |
| `src/components/leads/BulkUploadDialog.tsx`          | 629, 899 | `user?.email || "unknown"` | `user?.full_name || user?.email || "unknown"` |
| `src/hooks/useKitSubscriptions.ts`                   | 118      | `user?.email || 'system'`  | `user?.full_name || user?.email || 'system'`  |
| `src/hooks/useKitPresets.ts`                         | 45       | `user?.email || 'system'`  | `user?.full_name || user?.email || 'system'`  |
| `src/components/kit/KitProfileTab.tsx`               | 214, 426 | `user?.email || 'System'`  | `user?.full_name || user?.email || 'System'`  |
| `src/components/calendar/AddCalendarEventDialog.tsx` | 148, 172 | `user?.email || "System"`  | `user?.full_name || user?.email || "System"`  |


**NOT changed:** `PerformanceNotesDialog.tsx` (uses `user?.id` — correct for that table's FK), `logToStaffActivity` calls (those pass `user.email` as a separate param for the email field — correct).

**Note:** The `useAuth` context needs to expose `full_name`. Check if it already does — if `user` comes from Supabase Auth, it has `user_metadata.full_name`. The hook likely needs `user?.user_metadata?.full_name` or a profile lookup.

---

### Part 4: Automation Engine Profile Resolution (FIX 5)

**File: `supabase/functions/run-automations/index.ts**` (lines 180-196)

The automation engine resolves `trigger.assigned_to` and `trigger.created_by` by looking up `.eq("email", value)`. Since `assigned_to` now stores names and `created_by` is being migrated to names, these lookups fail silently.

**Fix:** Add a `resolveProfileByNameOrEmail` helper that:

1. First tries `.eq("full_name", value)`
2. Falls back to `.eq("email", value)`

Replace the 3 profile lookup blocks (lines 171-176, 181-186, 189-195) to use this helper.

Also fix `notifications` insert: currently `user_id` is set to the email/name string (line 206: `user_id: uid`). It should be the actual profile UUID. Update the helper to return `{ id, email }` so the notification gets the correct UUID.

---

### Part 5: SQL Migration (FIX 5C + FIX 6 data cleanup)

**New migration file:**

- Create index `idx_profiles_full_name` on `profiles(full_name)`
- Migrate existing `created_by` email values to full_name in `leads`, `tasks`, `customers`, `quotations` tables

---

### Part 6: Role+Name Display Audit (FIX 3)

Quick audit confirms:

- **CHECK A:** TaskSavedFilterDialog — previously fixed to save raw name values. Will verify during implementation.
- **CHECK B:** Display resolution uses `getStaffDisplayName` in tables and detail views. Already correct.
- **CHECK C:** Automation condition builder — conditions compare against raw DB values. Already correct.

No changes expected unless audit reveals issues.  
  
  
---

BEFORE PROCEEDING — Address these 6 gaps in the plan above. Update the plan to include all of them, then implement everything together.

---

GAP 1 — FIX 2A (Snooze logging) is incomplete.

Your plan states snoozeTask "already logs via logActivity via updateTask" — this is incorrect. I have reviewed the actual code. snoozeTask writes to task_snooze_history then calls updateTask. It does NOT write to activity_log with lead_id at all.

You must add BOTH of the following explicitly inside snoozeTask in useTasks.ts, after the updateTask call:

(a) task_activity_log insert:

  await (supabase.from("task_activity_log") as any).insert({

    task_id: id,

    event_type: "snoozed",

    metadata: {

      snoozed_until: snoozedUntil.toISOString(),

      hours_added: hoursToAdd,

      original_due_date: task.due_date,

    },

  });

(b) lead activity_log insert (only if task.lead_id exists):

  if (task.lead_id) {

    await supabase.from("activity_log").insert({

      lead_id: task.lead_id,

      activity_type: "task_snoozed",

      activity_category: "task",

      user_id: user?.id || null,

      user_name: user?.full_name || user?.email?.split("@")[0] || "System",

      title: `Task Snoozed: ${task.title} — until ${snoozedUntil.toLocaleDateString()}`,

      metadata: {

        task_id: [task.id](http://task.id),

        snoozed_until: snoozedUntil.toISOString(),

        original_due_date: task.due_date,

        hours_added: hoursToAdd,

      },

      related_entity_type: "task",

      related_entity_id: [task.id](http://task.id),

      is_manual: false,

      is_editable: false,

    });

  }

Both are required. Do not skip either.

---

GAP 2 — Task reschedule logging to lead timeline is missing entirely.

In TaskCompletionDialog.tsx, in the if (nextAction === "reschedule") block, after the existing logTaskActivity("rescheduled", ...) call, add a lead activity_log entry if task.lead_id exists:

  if (task.lead_id) {

    await supabase.from("activity_log").insert({

      lead_id: task.lead_id,

      activity_type: "task_updated",

      activity_category: "task",

      user_id: user?.id || null,

      user_name: user?.full_name || user?.email?.split("@")[0] || "System",

      title: `Task Rescheduled: ${task.title} — moved to ${nextDueDate}`,

      metadata: {

        task_id: [task.id](http://task.id),

        old_due_date: task.due_date,

        new_due_date: nextDueDate,

        reason: rescheduleReason?.trim() || null,

      },

      related_entity_type: "task",

      related_entity_id: [task.id](http://task.id),

      is_manual: false,

      is_editable: false,

    });

  }

This was in the original requirements. It is not in your plan. Add it.

---

GAP 3 — SUPABASE_[ACCESS.md](http://ACCESS.md) is completely missing from the plan.

Add a new file SUPABASE_[ACCESS.md](http://ACCESS.md) in the project root with the following content exactly:

---

# Supabase Database Access & Migration Guide

## Current Setup

- Project ID: ehuxwzbdnpyelmtckoac

- Owner: Lovable (project was scaffolded via Lovable's account)

- Credentials are currently managed by Lovable

## Step 1 — Transfer Project Ownership to Your Own Account

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and log in with the Lovable-linked account

2. Open the project → Settings → General

3. Under "Transfer Project" enter your own Supabase account email

4. Accept the transfer invitation from your inbox

5. After transfer, you own all credentials and billing

## Step 2 — Get Connection Credentials (after transfer)

- Dashboard → Settings → Database → Connection string (URI format)

- Dashboard → Settings → API → service_role key (for migrations and scripts)

- Dashboard → Settings → API → anon key (already in Vercel env vars)

## Step 3 — Export the Database (full backup)

Option A — Supabase CLI (recommended):

  npm install -g supabase

  supabase login

  supabase db dump --project-ref ehuxwzbdnpyelmtckoac -f maharaja_full_backup.sql

Option B — pg_dump via direct connection:

  pg_dump "postgresql://postgres:[YOUR_DB_PASSWORD]@db.ehuxwzbdnpyelmtckoac.supabase.co:5432/postgres" \

    --no-owner --no-privileges -F c -f maharaja_backup.dump

Option C — Dashboard (Pro plan only):

  Database → Backups → Download latest daily backup

## Step 4 — Restore to a New Supabase Project

  # Via Supabase CLI:

  supabase db push --project-ref [NEW_PROJECT_REF]

  # Via psql:

  psql [NEW_CONNECTION_STRING] < maharaja_full_backup.sql

## Step 5 — Update Vercel After Migration

In Vercel dashboard → Project → Settings → Environment Variables, update:

  VITE_SUPABASE_URL = https://[NEW_PROJECT_REF].[supabase.co](http://supabase.co)

  VITE_SUPABASE_ANON_KEY = [new anon key from new project]

Then redeploy.

## What Lovable Can Do Without Direct Access

- Add SQL files to supabase/migrations/ → auto-run on next deploy

- For data fixes or diagnostics: provide SQL and Lovable runs it as a migration

---

---

GAP 4 — FIX 3 role+name display audit must be explicit, not dismissed.

"No changes expected unless audit reveals issues" is not acceptable. During implementation you must explicitly check and document each of the following three items as code comments or in the PR description:

CHECK A: In TaskSavedFilterDialog (and any other filter save dialog) — when a rule for assigned_to or created_by is saved, confirm that rule.value is the raw name (e.g. "Nipun Tantia") and NOT the display label ("Admin - Nipun Tantia"). If wrong, fix it.

CHECK B: In EnhancedTaskTable, EnhancedLeadTable, and saved filter display — when rendering a saved filter rule, confirm the stored raw name is passed through getStaffDisplayName(rawName, staffMembers) to produce the "Role - Name" display. If raw name is shown directly without this resolution, fix it.

CHECK C: In the workflow automation condition builder — confirm that when a condition targets assigned_to or created_by and a staff member is selected, the saved condition value is the raw name, not the display label. If wrong, fix it.

Document your findings for each check. Fix anything that is wrong.

---

GAP 5 — Resolve the user?.full_name dependency before writing any code for FIX 4.

You correctly flagged that useAuth may not expose full_name directly, then left it as an open question. This is the dependency the entire created_by migration rests on. Resolve it now.

Check the useAuth context file and determine the exact property path for the logged-in user's full name. The correct path will be one of:

  - user?.full_name  (if the context already enriches the user object from profiles)

  - user?.user_metadata?.full_name  (if using raw Supabase Auth user)

  - user?.profile?.full_name  (if there is a separate profile object on the context)

Look at how the task detail panel already calls getStaffDisplayName(task.created_by, staffMembers) and also check the ValueRow line that shows "Created by" — this tells you what shape user has in context.

Whichever path is correct, use it consistently across all 6 files in FIX 4. Do not use different property paths in different files. State the confirmed path explicitly in your implementation notes before writing code.

---

UPDATED IMPLEMENTATION ORDER

Part | Priority | Files | Notes

-----|----------|-------|------

1 | Medium | TaskDetailView.tsx | Parent activity history (collapsible)

2 | High | useTasks.ts, TaskCompletionDialog.tsx | Snooze + reschedule + follow-up lead logging (GAP 1 + GAP 2 now included)

3 | High | 6 files with created_by writes | Requires GAP 5 resolved first

4 | Critical | run-automations/index.ts | Dual lookup + correct UUID in notifications

5 | High | SQL migration file | Index + data cleanup for created_by

6 | Low | Audit only | FIX 3 display audit (GAP 4 — must document findings)

7 | Low | SUPABASE_[ACCESS.md](http://ACCESS.md) | New file in project root (GAP 3)

Parts 3 and 4 are dependent — complete GAP 5 (full_name property path resolution) before starting Part 3, and confirm Part 3 is done before Part 4 since Part 4's create_task action uses created_by.

All 7 parts must be in the same PR. Do not split.

---

### Implementation Order


| Part | Priority | Files                                     |
| ---- | -------- | ----------------------------------------- |
| 1    | Medium   | `TaskDetailView.tsx`                      |
| 2    | High     | `useTasks.ts`, `TaskCompletionDialog.tsx` |
| 3    | High     | 6 files with `created_by` writes          |
| 4    | Critical | `run-automations/index.ts`                |
| 5    | High     | SQL migration                             |
| 6    | Low      | Audit only, no changes expected           |
