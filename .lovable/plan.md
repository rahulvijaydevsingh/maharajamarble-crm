

## Prompt 2: Task DB Schema Additions — Chain, Closure & Reminders

### Current State Assessment

The `tasks` table already has `parent_task_id` (UUID FK to tasks.id) from a previous migration. The following columns from the spec are **missing**:

| Column | Type | Status |
|---|---|---|
| `parent_task_id` | UUID FK tasks(id) | Already exists |
| `closed_at` | TIMESTAMPTZ | Missing |
| `closed_by` | UUID FK profiles(id) | Missing |
| `reschedule_count` | INTEGER DEFAULT 0 | Missing |
| `reschedule_reason` | TEXT | Missing |
| `reminder_offset_hours` | INTEGER | Missing |
| `custom_reminder_at` | TIMESTAMPTZ | Missing |

The `task_activity_log` table currently has: `id`, `task_id`, `event_type`, `metadata` (jsonb), `notes`, `user_id`, `user_name`, `created_at`. The spec asks for dedicated `action`, `performed_by`, `old_value`, `new_value`, `reason` columns.

### Design Decision: task_activity_log columns

The existing `task_activity_log` uses a flexible `event_type` + `metadata` JSONB pattern. Rather than adding redundant dedicated columns (`action`, `old_value`, `new_value`, `reason`, `performed_by`) which would duplicate what `event_type`, `metadata`, `user_id`, and `user_name` already handle, I recommend keeping the current flexible schema and storing structured data inside `metadata`:

```json
{
  "action": "rescheduled",
  "old_value": "2026-03-10",
  "new_value": "2026-03-15",
  "reason": "Client unavailable"
}
```

This avoids a breaking migration on an existing table with data, keeps the schema DRY, and the timeline UI already reads from `metadata`. The spec's intent (capturing old/new values, reasons, performed_by) is fully met via the existing columns.

### Implementation

**Single database migration** adding 6 columns to the `tasks` table:

```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reminder_offset_hours INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_reminder_at TIMESTAMPTZ DEFAULT NULL;
```

**No UI changes.** All new columns are nullable or have defaults, so existing tasks and all current code continue to work unchanged. The types file will auto-regenerate.

### Files Changed

| File | Change |
|---|---|
| SQL Migration | Add 6 columns to `tasks` table |

Zero code changes needed for this prompt -- it is DB-schema only as the spec states.

