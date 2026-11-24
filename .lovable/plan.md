# Restore lead conversion from task views

## Goal
Make the **Convert to Customer** button available for an eligible lead profile whether it is opened from Lead Management or through a task, while using the same established conversion flow.

## Confirmed diagnosis
- The lead profile renders the button only when it receives an `onConvertToCustomer` action.
- Lead Management supplies that action and opens the existing conversion dialog, matching the screenshot where the button is visible.
- Both task entry points open the same lead profile without supplying that action:
  - the Tasks table's related-lead modal
  - the task detail modal's related-lead modal
- The button is not currently controlled by the lead's `Won` status; the missing action is the reason it disappears in task context.

## Implementation
1. Reuse the existing customer-conversion dialog and its established data payload in the Tasks table.
   - Keep the selected lead available while the profile closes and the conversion dialog opens.
   - Preserve the existing conversion behavior, task relinking, audit activity, attachments handling, and permission model.

2. Add the same conversion handoff to the task detail modal.
   - Provide the lead profile with the conversion action when its related lead is opened from a task.
   - Close and clear nested dialogs in the correct order so the profile, task modal, and conversion dialog remain usable.

3. Keep the lead profile presentation unchanged.
   - Do not alter lead status rules, conversion eligibility, staff identity fields, task relationships, or DialogContent stacking.
   - The action will appear through the existing `LeadDetailView` condition only when its caller supports the established conversion flow.

4. Add focused regression coverage for both task-origin entry points.
   - Verify each passes the conversion action to the lead profile and launches the shared conversion dialog with the selected lead.
   - Verify the existing Lead Management conversion path remains unchanged.

5. Validate the central flow.
   - Run the focused checks and TypeScript validation.
   - Open a lead from a task and confirm the profile shows **Convert to Customer**, then confirm it opens the same conversion choices used from Lead Management.

## Files expected to change
- `src/components/tasks/EnhancedTaskTable.tsx`
- `src/components/tasks/TaskDetailView.tsx`
- Focused test file(s) added alongside the affected task/lead UI code, if no suitable existing test file is available.

## Guardrails
- No unrelated CRM logic or permissions will change.
- No files will be truncated; no placeholder code will be used.
- `.gitignore` and lockfiles will not be modified.
