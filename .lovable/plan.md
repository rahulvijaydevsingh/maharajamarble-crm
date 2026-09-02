# Lead & Task Lifecycle Fortification

## Goal
Keep Maharaja Marble CRM sales-focused and make lead tracking plus task execution dependable, easy to manage, and measurable—without introducing inventory, fulfilment, billing, or other operations modules.

## What the audit confirmed
- The CRM already has substantial lead, task, reminder, automation, notification, calendar, activity-log, permissions, and follow-up functionality.
- Lead status is stored only as the current value, so the CRM cannot reliably show stage history or time spent at each stage.
- Task work is split between CRM tasks and a separate To-Do Lists area, which can fragment personal action tracking.
- Lead priority is manual; interaction and follow-up signals are not consolidated into a transparent lead-health indicator.
- The dashboard provides overview counts and source distribution, while a sales-focused operational view of aging, stalled leads, and task ownership is not yet a dedicated command center.
- The app currently has duplicate automation triggers on leads, tasks, customers, and professionals. These must be audited and consolidated before lifecycle automation is extended, to avoid duplicate notifications or tasks.

## Recommended build sequence

### 1. Stabilize lifecycle foundations first
- Map every existing lead/task state transition, completion, snooze, cancellation, reminder, and automation path.
- Remove or consolidate duplicate automation trigger registrations only after confirming the active rule paths and their production impact.
- Establish one authoritative lifecycle contract for task status, lead status, follow-up dates, and notification side effects.
- Add regression coverage for the known high-risk paths: lost leads, pending lost approval, recurrence, reminder snooze/dismissal, reassignment, and task completion.

### 2. Make the task workspace the daily operating center
- Refine the existing Tasks area into clear operational queues: **My work**, **Today**, **Overdue**, **Upcoming**, **Unassigned**, and **Completed/Cancelled**.
- Preserve the existing task-board, reminders, bulk actions, recurring tasks, and saved-filter capabilities; compose them into a consistent, role-aware workflow instead of adding a parallel task system.
- Add a frictionless capture path for simple personal work while keeping every CRM-related task linked to its lead/customer/professional.
- Clarify the boundary between Tasks and To-Do Lists; either make To-Do Lists explicitly personal-only or safely enable conversion/linking so actions do not disappear into a disconnected list.

### 3. Make lead health and ownership unmistakable
- Introduce a transparent lead-health model based on existing data: stage, last follow-up, next action, open/overdue task count, priority, and age since creation.
- Surface consistent health and “next best action” signals in the leads table, kanban cards, lead profile, task details, and dashboard queues.
- Add an admin/manager exception queue for unassigned leads, leads without a next action, overdue/stale leads, and pending-lost approvals.
- Keep assignment values as raw profile full names, honoring the project’s existing identity invariant.

### 4. Add lifecycle history and practical management reporting
- Record each lead status transition with from/to status, actor, timestamp, and reason where required.
- Provide focused reporting for lead aging, stage dwell time, conversion by source/assignee, task completion/overdue rates, and pending-lost turnaround.
- Make reports filterable by period and staff; do not expand into revenue, inventory, orders, or accounting reporting.

### 5. Make automation safe and observable
- Add guardrails to prevent duplicate rule executions and duplicate task/notification creation.
- Show rule execution outcomes and a human-readable reason when automation skips or fails.
- Retain the existing no-new-realtime-subscriptions constraint; use the current shared providers, registry, and catch-up queries.

## Technical details
- Changes will build on the existing `leads`, `tasks`, `reminders`, `notifications`, `activity_log`, `task_activity_log`, `automation_rules`, and `automation_executions` foundations.
- Any new lifecycle-history data will use a Supabase migration with explicit grants, RLS, and role-safe policies.
- Current task linkage conventions (`lead_id` plus `related_entity_type`/`related_entity_id`) will remain supported to prevent breaking historical records.
- Existing data will be backfilled conservatively where possible; no destructive normalization or workflow replacement will occur without review.

## Explicitly out of scope
- Inventory, product catalogue, slab/batch tracking
- Orders, delivery, invoices, GST workflows, payments, procurement
- General business/ERP expansion
