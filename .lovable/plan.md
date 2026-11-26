## 1. Confirmed Root Cause(s)

1. **High confidence — profile data is cleared in the same update that closes the Radix dialog.** `src/pages/Professionals.tsx:58-68` calls `setDetailViewOpen(open)` and, when false, `setSelectedProfessional(null)`. `src/components/tasks/TaskDetailView.tsx:935-941` uses the identical pattern for a professional opened from task details; it also clears lead/customer selections at `917-932`. `ProfessionalDetailView` has `if (!localProfessional) return null` at `src/components/professionals/ProfessionalDetailView.tsx:1304`, while `CustomerDetailView` has the equivalent guard at `src/components/customers/CustomerDetailView.tsx:385` and `LeadDetailView` returns only its fallback when its resolved entity disappears at `src/components/leads/LeadDetailView.tsx:423`. This can unmount a closing Radix content tree before its close lifecycle finishes, leaving Radix’s temporary body-level interaction lock (`pointer-events: none`) or overlay cleanup incomplete. That blocks both hover and clicks; it is intermittent because React effect timing, exit animation timing, and route/data re-renders determine whether unmount happens before cleanup.

2. **Medium confidence — custom global cleanup changes body interaction state independently of Radix’s dialog stack.** `src/components/ui/dialog.tsx:30-42` clears body pointer events/overflow after every content unmount; `46-61` separately polls and clears them; `87-97` clears them on close autofocus and every animation end. The alert-dialog wrapper does the same at `src/components/ui/alert-dialog.tsx:31-63`. With multiple dialogs, these global mutations can race Radix’s own nested-layer bookkeeping, explaining why the existing safeguards do not reliably prevent the freeze.

3. **Contributing condition — layered dialogs use a separate z-index stack but do not coordinate their lifecycle.** `src/contexts/ZLayerContext.tsx:30-40` only updates React stack state and `66-79` only registers/release layers; it does not alter DOM focus, overlays, inertness, or pointer events. `TaskDetailView` and `ProfessionalDetailView` use it at `src/components/tasks/TaskDetailView.tsx:86-90` and `src/components/professionals/ProfessionalDetailView.tsx:1284-1288`. It is not the direct lock source, but its independent re-render during close can make the timing window more likely.

`LeadBriefPeopleStrip` actually navigates to `/professionals?view=<id>` at `src/components/tasks/LeadBriefPeopleStrip.tsx:70-75`; `src/pages/Professionals.tsx:29-52` opens the profile from that query. Thus the reported route is task detail → lead brief → Professionals page/dialog, not a dialog rendered inside TaskDetailView. The profile dialog is a Radix portal (`src/components/ui/dialog.tsx:75-80`), so it is a sibling portal rather than DOM-nested content.

## 2. Exact Repro Trigger

1. Open Task Details, where `TaskSubtasksCard` renders `LeadBrief` (`src/components/tasks/TaskSubtasksCard.tsx:16-20`).
2. Click the professional link, which navigates to `/professionals?view=<id>` (`src/components/tasks/LeadBriefPeopleStrip.tsx:70-75`).
3. The Professionals page resolves the query and opens `ProfessionalDetailView` (`src/pages/Professionals.tsx:29-52`).
4. Close it by X, Escape, or overlay. Radix invokes `onOpenChange(false)`; `handleDetailViewClose` immediately sets both `detailViewOpen=false` and `selectedProfessional=null` (`src/pages/Professionals.tsx:58-68`). The same close-and-clear pattern is present in task-launched entity profiles (`src/components/tasks/TaskDetailView.tsx:917-941`).

The freeze is not reproducible from the signed-out preview, so the exact browser timing remains unverified. The code-level trigger is the same-tick `open=false` plus entity-clear while the closing Radix portal is still responsible for returning pointer events and focus; quick close/reopen, data refresh, or animation completion makes it intermittent.

## 3. All Affected Nested-Modal Flows

| Flow | Shared unsafe pattern | Evidence |
|---|---|---|
| Task Details → Lead/Customer/Professional profile | Clears selected entity in the nested profile’s close callback | `src/components/tasks/TaskDetailView.tsx:917-941` |
| Task list → Professional profile | Clears selected professional in the close callback | `src/pages/Tasks.tsx:310-316` |
| Professionals directory/deep-link → Professional profile | Clears selected professional in the close callback; this is the reported Lead Brief route | `src/pages/Professionals.tsx:29-68` |
| Lead list / duplicate preview → Lead profile | Requires verification during implementation; these render `LeadDetailView` from `src/components/leads/EnhancedLeadTable.tsx:1504-1507` and `src/components/leads/DuplicateLeadModal.tsx:195-198` |
| Customer directory → Customer profile | Requires verification during implementation; renders `CustomerDetailView` from `src/components/customers/EnhancedCustomerTable.tsx:1116-1119` |
| Entity profile → child task/reminder/quotation/activity dialogs | Multiple Radix dialogs share global body cleanup; e.g. Lead children are sibling portals at `src/components/leads/LeadDetailView.tsx:674-738`, Customer children at `src/components/customers/CustomerDetailView.tsx:590-629`, and Professional child dialogs at `src/components/professionals/ProfessionalDetailView.tsx:440-502`, `695-742`, `920-923`, `1217-1229` |

## 4. Recommended Systemic Fix Plan

1. Establish a single close-retention pattern for entity detail views: close first, keep the selected entity mounted through Radix’s exit lifecycle, then clear it only after the close has settled. Apply it to every confirmed direct caller rather than changing CRM permissions, records, or profile business logic.
2. Ensure each detail component continues to render its `Dialog open={false}` until the parent’s delayed clear occurs; do not depend on an early `return null` during a close. Keep the standard Radix portal and its base `z-50` discipline unchanged.
3. Replace the competing global body-style resets in the shared dialog wrappers with a lifecycle-safe, stack-aware recovery guard that runs only when no active dialog/sheet/alert content remains. It must not overwrite Radix’s lock while another modal is open.
4. Audit and normalize the equivalent close paths for LeadDetailView and CustomerDetailView, including X, Escape, and overlay dismissals; preserve existing higher sibling content classes where already required, without raising main `DialogContent` above `z-50`.
5. Add focused Vitest coverage for the close-retention helper/wrapper behavior: close nested entity profile, advance timers/animation cleanup, assert `document.body.style.pointerEvents !== "none"`, no stale overlay remains, and the originating task/profile remains interactive. Cover X/Escape/backdrop callbacks and a rapid re-render during close.
6. Verify the task → Lead Brief → professional deep-link flow in an authenticated browser session and repeat the close sequence several times, then confirm no body lock, `data-scroll-locked`, inert residue, or hit-testing overlay remains.

## 5. Files Expected to Change

- `src/components/ui/dialog.tsx`
- `src/components/ui/alert-dialog.tsx` (only if the shared lifecycle guard is consolidated there)
- `src/lib/` new focused dialog-close lifecycle helper, if needed to avoid duplicated timers
- `src/pages/Professionals.tsx`
- `src/pages/Tasks.tsx`
- `src/components/tasks/TaskDetailView.tsx`
- Direct callers confirmed during implementation for `src/components/leads/LeadDetailView.tsx` and `src/components/customers/CustomerDetailView.tsx`
- Focused Vitest test files beside the shared helper or existing dialog/profile tests

No overlap is expected with the PR #149 collision fence: `src/App.tsx`, `src/index.css`, `public/site.webmanifest`, `src/components/tasks/TaskCompletionDialog.tsx`, `src/constants/taskConstants.ts`, `src/mobile/**`, lockfiles, and `supabase/**` remain untouched.