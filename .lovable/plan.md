# PRD: Maharaja Marble CRM mobile experience

## Product decision
Create a fresh, phone-first work experience for Maharaja Marble CRM. Phone users will automatically open the mobile experience, with a persistent **Switch to full CRM** option; staff can return to mobile from the full experience. Larger screens continue to use the existing CRM unchanged.

The first release prioritizes fast, reliable **data entry and task follow-up**: calls, reminders, updates, and lead/customer information. It does not duplicate administration, reports, configuration, payroll, bulk upload, or other desktop-heavy workflows.

## Current fit and safeguards
- The app already uses one React router, shared sign-in state, role checks, and shared data providers; the mobile experience can reuse these rather than create a second application or database.
- Existing desktop pages remain intact. The new mobile routes will reuse current permissions, assignment rules, audit behavior, task/professional relationships, and notifications.
- The current screen has a compact header/mobile search, but the main navigation remains a broad desktop-style sidebar. A purpose-built phone workflow is justified.

## Entry and switching
1. On screens below the existing 768px mobile threshold, send signed-in users to `/m` or the matching mobile destination, unless they chose the full CRM for that browser session.
2. Preserve the intended destination after sign-in, deep links, browser Back, and notification links.
3. Show a clear, non-destructive switch between **Mobile workspace** and **Full CRM** in the account/menu area. Store the choice locally so staff are never trapped or redirected in a loop.
4. Do not use user-agent string detection as the source of truth. Use viewport capability/width, with the explicit user choice taking priority. This supports tablets, resized browsers, and future devices safely.

## Mobile information architecture
A fixed bottom bar offers five destinations:

```text
Today | Work | Add | People | More
```

- **Today:** overdue/next tasks, reminders with the related lead/customer/professional name, upcoming calls, quick check-in status, and a small activity timeline.
- **Work:** task queue with filter chips (Today, Overdue, Upcoming, Completed, Cancelled), assignment/status visibility, and task detail with linked lead/customer/professional.
- **Add:** fast actions for lead, task, call outcome/follow-up, note, reminder, customer, and professional. Each opens a short, phone-optimized form.
- **People:** mobile search and recent leads/customers/professionals; profile pages prioritise phone, WhatsApp/call actions, next action, notes, attachments, and linked tasks.
- **More:** calendar, to-do lists, quotations, messages, attendance/leave where permitted, notifications, profile, and the full-CRM switch. Admin-only items remain protected and can initially link to full CRM.

## Core release workflows
### 1. Fast lead data entry
- Start a new lead from the Add tab, search, or a task context.
- Keep required fields focused; reveal secondary fields progressively.
- Validate duplicate phones exactly as today and retain the current professional-link logic.
- After saving, offer immediate next actions: call, WhatsApp, add note, add reminder, or create follow-up task.

### 2. Task follow-up and calls
- Make the next actionable task the first item on Today/Work.
- Provide one-tap call and WhatsApp actions, then a quick outcome sheet to log the result, note, next action date, reminder, and task completion/reschedule.
- Always show the related person’s name and relationship on a task/reminder.
- Retain existing task status rules, including Cancelled status and lost-lead behavior.

### 3. Reminders and quick updates
- Show reminder due time, task, and related person together.
- Allow snooze, complete, call outcome, note, reassignment when permitted, and date change without entering desktop-style dialogs.
- Deliver the same notification data and reading/dismissal behaviour as the existing system.

### 4. People details
- Use a compact profile header with direct call/WhatsApp buttons.
- Display only work-relevant tabs initially: Overview, Tasks, Notes/Activity, Attachments, and Quotations where applicable.
- Keep the current secure attachment and permission behaviour; use camera/photo selection in the existing upload flow.

## Experience principles
- One-handed operation: primary actions within thumb reach, large touch targets, minimal typing, sticky save/action controls.
- Dense but readable: task urgency and related person visible without opening extra panels.
- Familiar Maharaja Marble identity: existing navy, gold, marble treatment, and semantic design tokens.
- Reliable on field networks: loading, retry, offline/no-connection state, and explicit save success/failure feedback. No silent data loss.
- Accessible: semantic controls, visible focus, colour is not the only status signal, and screen-reader labels.

## Delivery phases
1. **Foundation and mobile shell:** add the isolated `/m` route family, selection/switch logic, bottom navigation, mobile layout, shared deep-link handling, and analytics-ready events. Build no desktop regressions.
2. **Today, Work, Add:** deliver task/reminder queue, task follow-up/outcome flows, quick actions, and focused lead/task forms.
3. **People and mobile profiles:** deliver search, recent people, mobile lead/customer/professional pages, notes, activity, and secure attachments.
4. **Supporting work:** calendar, to-dos, quotations, messages, attendance/leave as role-permitted; initially retain desktop handoff for complex/admin-only areas.
5. **Pilot and rollout:** enable for selected staff, compare completion time/error rates, repair issues, then roll out automatically to all phone users while retaining the switch.

## Success measures
- A field user can record a call outcome and next follow-up in under 30 seconds.
- A new lead can be entered with a next action in under 90 seconds.
- Every mobile task/reminder visibly names its related lead/customer/professional.
- No desktop route, role restriction, data record, or existing workflow changes behaviour.
- Pilot users complete daily task follow-ups on phone without needing to switch to the full CRM for routine work.

## Technical approach
- Add a separate mobile route namespace and presentation components that call existing hooks/providers; do not fork data logic, tables, or permissions.
- Keep current role protection around every mobile route and action.
- Use a viewport-based gate plus local explicit preference, not fragile user-agent parsing; never force desktop users away from a requested full-CRM deep link.
- Reuse the current 768px threshold initially, with tests for redirect, preference override, authentication, deep links, roles, task statuses, and related-person labels.
- Verify pilot flows on phone and desktop sizes before each release.

## Out of scope for the first mobile release
- Replacing the full desktop CRM.
- Changing roles, security policies, assignments, audits, task status logic, professional resolution, or reminder business rules.
- Offline editing/synchronisation beyond safe connection-state feedback and retry.
- A separate native iOS/Android application.
