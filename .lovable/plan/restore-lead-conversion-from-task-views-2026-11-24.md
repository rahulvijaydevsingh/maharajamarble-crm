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
  
  
---
  ## Mandatory Addendum & Overrides (Deploying Directly to `main`)
  Before making any edits, incorporate the clarifications, architectural override, and production/PR-safety guardrails below into your plan. This change is going directly onto `main` (live production `crm.maharajamarble.com`) while a Mobile CRM PR `feat/mobile-workspace`) is pending merge, so strict file boundaries and verification are required.
  ### 1. Clarified Product Requirement
  - **Always show Convert to Customer in Lead Profile:** Any eligible, unconverted lead opened in `LeadDetailView` MUST display the **Convert to Customer** button regardless of where it was opened from (Lead Management table, Tasks table, Task Detail modal, Professional profiles, Reminders/Notifications, Search, or deep links).
  - **Clarification on `Won` status:** We manually changed a lead's status to `Won` only as a test to see if setting `Won` acted as conversion. Setting status to `Won` must NOT auto-convert or bypass `AddToCustomerDialog` (which creates the customer, copies files via `import_lead_files` into encrypted `customer-secure` storage, relinks open tasks, and logs conversion activity). However, a lead whose status was manually set to `Won` (and has NOT actually been converted to a customer) MUST still show **Convert to Customer** so staff can complete real conversion.
  ### 2. Mandatory Pre-Edit Audit (Inspect Before Editing)
  1. **Find every caller of `LeadDetailView` across `src/`** (Lead Management, `EnhancedTaskTable.tsx`, `TaskDetailView.tsx`, Professional views, Reminders/Notifications, Search, etc.) and note which callers currently omit `onConvertToCustomer`.
  2. **Inspect exact button-visibility & conversion-eligibility rules** in `LeadDetailView` and `AddToCustomerDialog`:
     - Confirm exact fields used to mark a lead as already converted (e.g., `is_converted`, `converted_to_customer_id`, `status`, `is_deleted`, role/permission flags).
     - Explicitly verify whether `status === 'won'` currently hides or blocks **Convert to Customer** anywhere.
     - Confirm exactly what `AddToCustomerDialog` writes to `leads` and `tasks` (including `lead_id` / `related_entity_type` / `related_entity_id`) on conversion.
  ### 3. Architectural Override (Replaces Step 3 of Your Original Plan)
  - **Make `LeadDetailView` self-capable (Single Source of Truth):** Do NOT rely on patching only `EnhancedTaskTable.tsx` and `TaskDetailView.tsx` while leaving `LeadDetailView` hiding the button whenever a caller omits `onConvertToCustomer`.
    - Give `LeadDetailView` a built-in fallback conversion trigger that launches the existing `AddToCustomerDialog` for the current lead whenever `onConvertToCustomer` is not passed by the parent.
    - Keep `onConvertToCustomer?: (lead: Lead) => void` supported as an optional prop so Lead Management (and any caller needing custom post-conversion behavior) keeps working identically with zero regressions.
    - Ensure only one `AddToCustomerDialog` mounts/opens at a time (no duplicate dialog instances).
  - **Eligibility & Converted-State Rules:**
    - **Unconverted leads (including leads manually set to `status = 'won'`):** Always show **Convert to Customer** (respecting existing role/permission rules and excluding deleted leads).
    - **Already-converted leads:** Do not allow duplicate customer creation; show a clear non-duplicating converted indicator (or existing View Customer link if present) rather than silently vanishing without context.
  - **Nested Dialog, Focus & `z-50` Discipline:**
    - When launching conversion from a nested flow `TaskDetailView` -> `LeadDetailView` -> `AddToCustomerDialog`), capture the selected `lead` object before closing `LeadDetailView` so the dialog never loses the lead mid-transition.
    - Keep standard `z-50` layering so Radix Select/Popover portals inside `AddToCustomerDialog` (e.g., staff picker) remain clickable and never get trapped behind overlays.
    - Verify canceling OR completing conversion leaves the page fully interactive (no stuck `pointer-events: none` or body scroll-lock) and refreshes the underlying task/lead view cleanly.
  - **Preserve All CRM Invariants:**
    - Preserve INVARIANT-04 `assigned_to`, `created_by`, `updated_by` stay staff `full_name` strings—never UUIDs or emails).
    - Preserve task-relinking compatibility with the orphan-safe task filter `!(lead_id != null && lead == null) && !is_deleted`), audit activity logging, and encrypted `import_lead_files` attachment copying.
  ### 4. Strict Guardrails for Live `main` & Pending Mobile PR `feat/mobile-workspace`)
  - **Zero File Collisions With PR #149 — DO NOT TOUCH:**
    - `src/App.tsx`
    - `src/index.css`
    - `public/site.webmanifest`
    - `src/components/tasks/TaskCompletionDialog.tsx`
    - `src/constants/taskConstants.ts`
    - `package.json`, `package-lock.json`, `bun.lock`, `index.html`, `vite.config.ts`, `vercel.json`, `.gitignore`
    - `supabase/**` (zero DB migrations, Edge Function edits, or RLS changes)
  - **Freeze Shared Hook Public Contracts:** Do NOT change exported types, function names, parameters, or return shapes in `useLeads.ts`, `useCustomers.ts`, `useTasks.ts`, `useActivityLog.ts`, or `useActiveStaff.ts`.
  - Keep changes strictly scoped to `LeadDetailView`, affected task/lead UI callers (only where needed for clean dialog handoff/refresh), and focused unit/component tests.
  ### 5. Required Verification & Final Output
  1. Add focused tests covering:
     - `LeadDetailView` opened WITH `onConvertToCustomer` (Lead Management path) and WITHOUT `onConvertToCustomer` (Tasks table, Task Detail modal, and standalone/other callers).
     - Manual `status = 'won'` unconverted lead still showing **Convert to Customer** and launching `AddToCustomerDialog`.
     - Already-converted lead blocking duplicate conversion cleanly.
     - Nested Task -> Lead -> Convert dialog open/cancel handoff without losing the selected lead.
  2. Run and report fresh results for:
     - `npx vitest run`
     - `npx tsc --noEmit -p tsconfig.app.json`
     - `npx vite build`
  3. **Output a 5-line "Desktop Conversion Contract Summary"** at the end of your response (for syncing our pending Mobile CRM PR) stating:
     - Exact condition that decides whether a lead is already converted vs. eligible to convert
     - Exact columns updated on `leads` when conversion completes
     - Exact columns updated on `tasks` when open tasks are relinked (specifically whether `lead_id` is set to `null`)
     - Exact list of files modified on `main`