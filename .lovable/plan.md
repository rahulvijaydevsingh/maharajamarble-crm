
Objective
- Implement the full “Task Completion System & Lead Leakage Prevention” spec from the uploaded DOCX in a way that:
  - Enforces mandatory completion data (notes, outcomes, next action) consistently across all places tasks can be completed
  - Logs activity reliably (including standalone tasks)
  - Prevents lead leakage via rules + your existing Automation Rules system (preferred) and your existing in-app notification system
  - Stays admin-configurable via the existing Control Panel tables (control_panel_options + control_panel_option_values), without hardcoding lists in the frontend

How the uploaded DOCX will be used
- The DOCX is treated as the product specification (source of truth for UX + rules, using the file as a reference and not absolute.using its spirit).
- We won’t “import” the DOCX into the app; instead we translate it into:
  1) Database schema changes (new tables/columns)
  2) UI flows (dialogs/pages)
  3) Backend scheduled checks + rule execution via your Automation system

Current state (what we already have)
- tasks table exists and already supports: due date/time, status, completed_at, related_entity_type/id, lead_id, snooze, recurrence.
- activity_log exists and is already used by useTasks() to log task_created/task_updated/task_completed/task_deleted.
  - But the UI fetching for logs is lead/customer-centric; there is not yet a dedicated “Task Activity Log” view.
- notifications table exists and is used for in-app notifications.
- Automation Rules UI + schema exists (automation_rules, automation_templates, automation_executions), but there is currently no “automation engine” in code to actually evaluate triggers and execute actions on a schedule.

Key design decisions (based on your answers + constraints)
1) Notifications
- We will use your existing in-app alerts/notifications system (notifications table + UI) for now.
- Email/WhatsApp/SMS are out of scope until you explicitly choose a provider.

2) Escalations & leakage prevention rules
- We will implement leakage prevention as “system-generated events” that are fed into your Automation Rules system via templates, so you can expand/change behavior without code (your preference).
- If the existing Automation engine is not currently executing rules, we must build it (minimal but solid) as part of this project; otherwise leakage rules cannot run automatically.

3) Convert to Deal/Order
- First version will be a simple flag + follow-up task (no new Deals module).

Implementation architecture (high level)
A) Enhanced Task Completion (user-driven, immediate)
- When a user clicks “Mark Complete”:
  - Show a structured completion dialog (status, outcome, templates, time spent, notes, optional bullets, attachments)
  - Enforce minimum note length (default 50; admin-configurable)
  - Enforce “Next Action” selection when not fully completed (create follow-up / reschedule / no further action / convert flag + task)
  - Write completion data into the database
  - Log the completion into Task Activity Log and (if related to lead/customer) into Lead/Customer Activity Log.

B) Leakage Prevention (system-driven, scheduled)
- A scheduled “backend job” runs periodically (e.g., hourly) to detect:
  - Overdue tasks at thresholds (1/3/7 days defaults; admin-configurable)
  - Leads idle for N days (default 14; admin-configurable)
  - Too many failed attempts / no-answer outcomes within window (admin-configurable)
- The job emits standardized “leakage events” into a table.
- Automation Templates consume those events to:
  - send notifications
  - create tasks/reminders
  - escalate (using your automation actions like send_notification, create_task, trigger_automation, execute_webhook later)

Phase plan (you selected “Full system”, but we still implement in safe increments)
Phase 0 — Hard verification + inventory (fast)
- Verify current task “completion” entry points:
  - EnhancedTaskTable row actions
  - LeadTasksTab checkbox completion
  - Calendar interactions
  - EditTaskDialog “Mark Complete” usage
- Identify which of these should be forced through the new completion flow (so completion never happens without mandatory fields).

Phase 1 — Database foundations (schema + RLS) (required)
1) Extend tasks table to store completion details & attempt tracking
Add columns (names final after code review, but conceptually):
- completion_status: text (Completed Successfully / Partially Completed / Could Not Complete)
- completion_outcome: text (chosen from admin-configured list per task type)
- completion_notes: text (mandatory, length enforced in UI + backend validation)
- completion_key_points: jsonb (optional bullet list)
- actual_time_spent_minutes: integer (optional)
- next_action_type: text (create_follow_up / reschedule / none / convert_flag)
- attempt_count: integer default 0
- last_attempt_at: timestamptz
- max_attempts: integer nullable (optional override per task; fallback from settings per type)
- deal_ready: boolean default false (for “Convert to Deal/Order” simple version)
- deal_ready_at: timestamptz nullable

2) Task-level activity log (for standalone tasks + detailed task history)
Option A (recommended): new table task_activity_log
- id, task_id, event_type, created_at, user_id/user_name, metadata jsonb, notes text, attachments jsonb
- This avoids overloading activity_log (which is lead/customer-centric).
- We will still “dual log” summary events into activity_log when tasks are related to lead/customer.

3) Task completion templates + outcomes (admin-configurable)
We will use your existing Control Panel tables to store:
- Task outcome options by task type
- Quick completion templates by task type (with placeholders)
- Next-action suggestions and defaults (rule-based)
Because Control Panel options are generic, we’ll add new Control Panel fields (control_panel_options rows) for:
- tasks.outcomes.<task_type> (or a normalized structure using JSON if preferred)
- tasks.completion_templates
- tasks.attempt_limits
- tasks.completion_settings (min note length, default follow-up days, etc.)

Note: If Control Panel is currently designed only for “flat option lists”, we’ll store complex template configs in a dedicated table instead:
- task_completion_templates (recommended if templates need placeholders + next-action presets + ordering + enable/disable)
This will be decided after we inspect Control Panel UI constraints.

4) Attachments for completion
- Reuse the existing private storage bucket and entity_attachments table if possible by extending entity_attachments to support entity_type='task'.
- This requires:
  - Updating RLS policies on entity_attachments to allow inserts/select/deletes for tasks a user can access
  - Updating UI to show task attachments in task detail view

Phase 2 — New Task Completion UI (core workflow) (required)
1) Add “Task Completion Dialog”
- Accessible from:
  - Tasks table action menu (“Mark Complete”)
  - LeadTasksTab completion checkbox (replace direct status toggle with this dialog)
  - Calendar actions (where applicable)
- Form sections matching spec:
  - Completion Status (3 options)
  - Outcome (task type-based, admin-configurable)
  - Quick Template selector (fills notes + outcome + suggested next action)
  - Actual time spent
  - Notes (min length enforced; show live counter)
  - Key points (optional)
  - Attachments upload (optional)
  - Next Action (mandatory; option A/B/C/D)
    - A Create Follow-up Task (prefill type/due/assignee/priority)
    - B Reschedule This Task (increments attempt; reason required; enforce max attempts)
    - C No Further Action (confirm)
    - D Convert to Deal/Order (set deal_ready=true and create a follow-up task)

2) Validation & security
- Client-side validation via zod (min length, required fields, attempt logic).
- Server-side enforcement:
  - We will not rely only on UI. We’ll add backend validation via database constraints/triggers or via a single “complete_task” backend function.
  - Preferred: a backend function endpoint “complete-task” so all completion writes go through one validated path.

3) Update useTasks API
- Add a dedicated method: completeTaskWithDetails(taskId, payload)
- Ensure it:
  - Writes completion details
  - Creates follow-up task / reschedules / sets deal flag as selected
  - Logs to task_activity_log (always)
  - Logs to activity_log (only if related lead/customer exists)
  - Triggers automation events if needed (Phase 4+)

Phase 3 — Task Detail View + Full Activity (required for “no leakage” accountability)
1) Task detail view page or dialog
- Open by clicking task title anywhere.
- Sections:
  - Task summary + action buttons
  - Task details panel
  - Attachments
  - Comments (if/when implemented)
  - Task Activity Log (timeline)
- “View Full History” shows filter/search UI for task_activity_log.

2) Dual logging behavior
- For related tasks:
  - Show in lead/customer activity log as summarized entries (already partially done in useTasks).
  - Show full detail in task_activity_log.

3) Standalone tasks separation
- Add filter in Tasks module: All / Related to Leads / Standalone
- Standalone = tasks with no lead_id and no related_entity_id.

Phase 4 — Automation Engine (required to use your Automation Rules for escalations)
Problem: Automation rules exist but there is no executor yet.
We will implement a minimal, safe automation engine that can:
- Evaluate triggers (time-based + saved-filter based first; then field-change)
- Execute actions (send_notification in-app, create_task, create_reminder, update_field, trigger_automation)
- Write execution logs to automation_executions

Architecture
1) Backend function: automation-runner
- Runs on a schedule (hourly/daily, configurable).
- Reads enabled automation_rules.
- For each rule, finds matching records (tasks/leads/customers/etc) based on trigger type.
- Applies execution limits (once per record / once daily / max limit).
- Executes actions and logs results.

2) Execution tracking table (if needed)
- automation_rule_executions_tracking already exists; we’ll use it to avoid re-firing.

3) Trigger types we prioritize for leakage prevention
- time_based triggers on tasks (relative to due_date / last_attempt_at / created_at)
- saved_filter triggers (e.g., “Overdue tasks > X”)
These map directly to your leakage needs.

Phase 5 — Leakage Prevention rules (built as Automation Templates + optional system event table)
We will ship a set of system templates (disabled by default, admin can enable) such as:
1) Task overdue 1 day → notify assignee (normal)
2) Task overdue 3 days → notify assignee + escalation recipients (important)
3) Task overdue 7 days → urgent notification + create manager review task
4) Lead idle 14 days → create “Check-in call” task due tomorrow
5) Multiple failed attempts → notify + suggest alternate channel task

Because you want to “use automation system for overdue task”:
- We implement these as Automation Templates for entity_type='tasks' and/or 'leads'
- Admin can edit outcomes, thresholds, and actions without code

If some leakage checks cannot be expressed with current Automation UI/fields:
- We add one “system leakage events” table and treat those events as an entity type for automations, OR
- We enhance Automation’s entity fields for tasks/leads to include computed fields (e.g., days_overdue, attempts_used)
This is a key integration detail we will finalize once we inspect AutomationRule builder constraints end-to-end.

Phase 6 — Control Panel configuration (admin UX)
Add Control Panel sections for:
- Completion settings:
  - minimum note length (default 50)
  - default follow-up due in days (default 3–5)
- Attempt limits per task type (defaults from your spec)
- Outcome options per task type
- Quick templates per task type (with placeholder support)
- Optional: whether “No further action” requires a second confirmation (default yes)

We will also implement your dependency safety requirement:
- If an admin tries to delete/deactivate an outcome/template currently used in existing task records, show a warning or block the action.

Testing plan (must pass before sign-off)
1) Task completion enforcement
- From Tasks list, Lead detail tab, Calendar: attempting to complete triggers the same completion dialog.
- Cannot save completion with notes < min length.
- “Could Not Complete” cannot save without Next Action.
2) Next action behaviors
- Follow-up task created correctly, linked to same entity, assigned appropriately.
- Reschedule increments attempt_count; blocks after max attempts (forces create-follow-up or escalation path).
- Convert-to-deal sets deal_ready=true and creates task.
3) Logging
- task_activity_log records every event.
- activity_log receives summary events only for lead/customer-related tasks.
4) Automation runner
- When enabled, overdue templates generate notifications/tasks exactly once per configured limit.
- Execution logs show success/failure.
5) Security
- RLS ensures users only see tasks, task activity logs, and attachments they are allowed to see.
- No sensitive data in console logs.
- All user inputs validated client + server side.

Deliverables summary (what you’ll get)
- A consistent “Mark Complete” workflow with enforced notes/outcomes/next steps.
- Dedicated Task detail + Task history, including for standalone tasks.
- Leakage prevention implemented through your Automation system, powered by a backend automation runner.
- Admin control over outcomes/templates/attempt limits/thresholds via Control Panel.

Known risks / dependencies
- The automation executor is the biggest missing piece today; without it, “scheduled leakage prevention” cannot be automated.
- Template management complexity may exceed the current “option list” style of Control Panel; if so we will introduce a dedicated table for templates while still managing basic options via Control Panel.

Next step after approval (implementation sequencing)
- Start with Phase 1 (schema) + Phase 2 (completion UI) + Phase 3 (task activity log UI), then Phase 4–5 (automation runner + leakage templates).
