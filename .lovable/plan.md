# Plan

## Section 1 — Backend (mostly already done, will verify)

- **1a Edge function redeploy:** Use `supabase--deploy_edge_functions` to redeploy `run-automations` so the latest `singularEntityType` normalization is live.
- **1b Metadata tables:** `company_settings`, `user_settings`, and `user_table_preferences` already exist in the live schema (visible in `data_export/`). I will NOT generate fresh `CREATE TABLE IF NOT EXISTS` migrations — running historical DDL on a live, populated DB is risky and we already exported all data. Instead I will:
  - Run `supabase--read_query` to confirm each table exists and has RLS enabled.
  - Only if RLS is OFF on any of them, ship a tiny migration that just runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (no CREATE, no policy churn).
  - Report findings either way.

## Section 2 — `SourceRelationshipSection.tsx` rewrite

Single file: `src/components/leads/smart-form/SourceRelationshipSection.tsx`.

Remove:

- State `phoneCheckInput`, `phoneCheckLoading`, `phoneCheckResult`.
- Functions `handlePhoneCheck`, `handleAcceptProfessional`.
- Entire "Or check by phone number" block (lines ~348–403) including the 3 result branches.
- `supabase` import and the `check-professional` invoke call.
- Static `getProfessionalTypeLabel` switch (replaced by dynamic lookup).
- Keep `getProfessionalTypeBadgeColor` as-is per spec (it's already the same mapping).

Add:

- New state: `showInlineQuickAdd`, `quickAddName/Phone/Type/FirmName/Email/City/ServiceCategory/Status/Priority`, `quickAddAdvancedOpen`, `quickAddLoading`.
- Destructure `addProfessional` from `useProfessionals` (already imports `professionals, loading`).
- Dynamic option lists via existing `getFieldOptions("professionals", …)` for type, city, service_category, professional_status, priority.
- Dynamic `getProfessionalTypeLabel` via `useCallback` against `professionalTypeOptions`.
- `handleQuickAddSubmit` that calls `addProfessional(...)`, then `onReferredByChange(...)` with the returned record, resets state, closes panel.
- Inside `<CommandList>`: keep `CommandEmpty`, and append a sticky "+ Quick-Add '&nbsp;' as New Professional" `CommandItem` when `searchQuery.trim()` is non-empty. Selecting it seeds `quickAddName` with the query, opens the inline panel, closes the popover.
- Inline Quick-Add panel rendered directly below the `Popover` (NOT a Dialog): bordered card with header + Cancel; required triad (Name, Phone, Category/Type) in a 3-col responsive grid; collapsible `Accordion` ("Advanced Options") containing Firm Name, Email, City, Service Category, Status, Priority; primary "Add & Select Professional" button (disabled when required fields empty or loading; shows spinner while loading).
- Add missing imports: `Accordion, AccordionContent, AccordionItem, AccordionTrigger` from `@/components/ui/accordion`. `useCallback` already present.

Keep all design-system tokens (no hard-coded colors beyond the existing badge-color mapping spec preserves).

## Section 3 — Admin bulk task completion

`src/components/tasks/EnhancedTaskTable.tsx`:

- Import `useAuth` (or reuse `usePermissions`) to detect admin.
- In `handleBulkAction` and `handleBulkActionImmediate`, replace the unconditional "Bulk complete not allowed" guard with: if user is admin → proceed with `updateTask(taskId, { status: "Completed", completed_at: new Date().toISOString() })` for each selected; else keep the existing toast block.
- Ensure the "Bulk Complete" menu item in the bulk-actions UI is enabled for admins (it's already rendered; just permits execution).
- Toast message: `Completed N tasks` on success.

No DB / schema changes. No other files touched.

## Section 4 — Verification

- Type-check via build pipeline.
- Confirm via preview: phone-check UI gone; Quick-Add CommandItem shows on unmatched search; inline panel expands in-form (no modal); selecting created pro populates "Referred By"; admin sees Bulk Complete working, non-admin still blocked.

## Out of scope / not doing

- I will NOT touch `index.html` (gptengineer.js tag is preserved).
- I will NOT regenerate migrations for tables that already exist and are populated — running stale CREATE statements on a live DB is unsafe even with `IF NOT EXISTS` (column drift). I'll only enable RLS if any of the three tables is missing it.  
  
  
also check if the following improvemets are applicable.  
Please incorporate the following critical optimizations and technical guardrails directly into your execution plan before writing code:
  ### 1. Refinement for Section 2 (SourceRelationshipSection.tsx)
  - **Command Filtering Guard:** Because shadcn's `<CommandList>` handles structural filtering automatically, ensure that the Quick-Add `CommandItem` uses a hardcoded, un-filterable bypass value or is structurally positioned so that `cmdk` doesn't hide it when there are 0 matching results.
  - **Immediate State Injection:** Ensure that `onReferredByChange` properly passes the newly created professional object back to the parent component immediately, so the form updates instantly even before the global list hook revalidation completes.
  ### 2. Refinement for Section 3 (Admin Bulk Task Completion)
  - **Role Verification:** Check `src/components/tasks/EnhancedTaskTable.tsx` to see how user roles are evaluated elsewhere in the file. If a hook like `usePermissions()` exists, use its boolean flag (e.g., `isAdmin`). If not, securely check the user metadata role via `useAuth()`.
  - **Concurrent Batching:** Instead of awaiting `updateTask` sequentially inside a `for...of` loop (which causes sequential network lag), batch the updates concurrently using `Promise.all(selectedIds.map(id => updateTask(...)))` to ensure snappy execution and a single, unified success toast message.
  Please update your plan tracking notes with these enhancements and proceed directly with the execution sequence.