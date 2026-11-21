# Plan: Restore the WhatsApp Library function

## What happened

The error appears while the lead screen loads a reusable WhatsApp media library. The app calls `wa_library_list` with the expected inputs (`p_kind`, `p_active_only`), but the live database reports that this function is absent from its schema cache.

The function is present in the project’s WhatsApp Library migration alongside the supporting `whatsapp_library_items` data structure and access rules. A read-only check of the live database found neither the function nor a matching library table. This indicates the WhatsApp Library database migration has not been applied to the production database, or its earlier foundation requirements are also missing.

## Safe repair approach

1. Inspect the live WhatsApp schema and migration history for the Library foundation, including the library item structure, required settings fields, helper functions, and current access rules.
2. Compare the live schema with the project’s WhatsApp Library migration to identify precisely which prerequisite changes are missing. Do not assume the full migration can be replayed safely.
3. Create one guarded repair migration that:
  - restores only missing, compatible WhatsApp Library fields/objects;
  - creates `wa_library_list` with the exact parameter names expected by the app;
  - restores the related administrator-only library actions only if they are missing;
  - grants access solely to signed-in CRM users and retains administrator-only changes/deletion;
  - avoids changing existing WhatsApp messages, sessions, queue items, lead data, or other CRM workflows.
4. Refresh the database schema cache through the completed migration and verify the function exists with the correct signature.
5. Confirm that the Library can load for an authenticated administrator and that non-administrators cannot change library content. Also confirm the lead profile view no longer shows the error.

## Safeguards

- No changes to lead, customer, task, reminder, professional, or automation data.
- No new broad public access; the library remains signed-in access with administrator-only management.
- No deletion or replacement of existing WhatsApp records, storage files, or policies without inspecting the live state first.
- If the migration history shows a partially applied or divergent WhatsApp rollout, stop after diagnosis and present the exact minimal repair before modifying the database.

## Expected result

The reusable WhatsApp Library loads without the red error. Leads and their existing workflow remain unchanged.

## Technical note

The frontend hook already calls the intended function correctly. The repair targets the production database schema, not the lead-profile interface.  
  
  
  
# STOP — DISCARD THE DATABASE REPAIR PLAN ABOVE. FRONTEND-ONLY FIX REQUIRED.

DO NOT execute any SQL, DO NOT create or run any Supabase migration, and DO NOT modify the Production database or schema cache. Replace the entire plan above with the **frontend-only** plan below and show me the revised plan before making edits.

## Context (Carry Forward)

- The Production Supabase database `jmohlloabmddaiyjvahp`) is **intentionally** on the pre-v2 schema until our full WhatsApp v2 rollout finishes on Preview. The absence of `wa_library_list` and `whatsapp_library_items` on Production is expected—NOT a broken migration.

- On Production, `whatsapp_settings.module_enabled` is `false`. All WhatsApp v2 UI must stay dormant while `module_enabled` is `false`.

- Root cause of the red error on the Lead screen: `SendWhatsAppDialog` is mounted on the Lead profile view with `open={false}`, and it unconditionally calls `useWhatsAppLibrary()`. Inside `src/hooks/useWhatsAppLibrary.ts`, a `useEffect` immediately invokes `supabase.rpc("wa_library_list", ...)` on mount and triggers a destructive red toast `"Library could not be loaded"`) when Production returns a schema-cache error.

## Strictly Forbidden Actions (HARD STOP)

- NEVER run SQL queries, migrations, or RPC/policy edits against Supabase.

- NEVER create, edit, rename, or delete any file in `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`, or `services/wa-gateway/`.

- NEVER modify `package.json`, `package-lock.json`, `bun.lock`, `tsconfig.app.json`, or Tailwind theme tokens `#C9A84C` / `#1A1A2E`).

- NEVER modify `src/lib/whatsappMedia.ts`, `src/lib/quotationPdf.ts`, or `src/hooks/useWhatsAppMessages.ts`.

- Do NOT scaffold new features, dialogs, auth logic, or unrelated refactors.

## Allowed File Scope `src/` Frontend Only)

Edit ONLY these files (plus any other file in `src/` found to call `useWhatsAppLibrary` or `"wa_library_list"`):

1. `src/hooks/useWhatsAppLibrary.ts`

2. `src/components/whatsapp/SendWhatsAppDialog.tsx`

3. `src/components/settings/WhatsAppLibraryManager.tsx`

## Required Changes

### 1. Gate & Lazify `src/hooks/useWhatsAppLibrary.ts`

- Update the hook signature to accept options: `useWhatsAppLibrary(options?: { enabled?: boolean })` with `enabled = false` by default so no mounted component can accidentally fire `wa_library_list` on page load.

- Guard `refresh(includeInactive = false)`: if `!enabled || !auth.user`, immediately set `items` to `[]` (or leave empty) and return `[]` without calling `supabase.rpc("wa_library_list", ...)`.

- Guard the auto-fetch `useEffect`: ONLY call `void refresh(isAdmin)` when `enabled` is `true` and `Boolean(auth.user)`.

- Add graceful missing-RPC handling inside `refresh`: if Supabase returns a missing-function / schema-cache error (e.g., `error?.code === "PGRST202"` or error message matching `/schema cache|Could not find the function/i`), set a boolean state `libraryUnavailable = true`, set `items` to `[]`, and DO NOT fire a destructive red toast. Keep destructive toast reporting for genuine runtime errors when `enabled` is `true`.

- Expose `libraryUnavailable` alongside existing return values `items`, `loading`, `mutating`, `isAdmin`, `refresh`, `upload`, `setActive`, `remove`) so all existing consumers remain backward-compatible.

### 2. Gate & Lazify `src/components/whatsapp/SendWhatsAppDialog.tsx`

- Read `settings` alongside `slotStatus` from `useWhatsAppSettings()`.

- Compute `const isLibraryEnabled = Boolean(open && settings?.module_enabled);`.

- Call `useWhatsAppLibrary({ enabled: isLibraryEnabled })`.

- In the `useEffect` that resets dialog state when `open` changes, remove the unconditional `void refreshLibrary()` call (or guard it strictly behind `isLibraryEnabled` without double-fetching), ensuring **zero** `wa_library_list` calls fire while `open === false` OR while `settings?.module_enabled` is `false`.

- When `!settings?.module_enabled` or `libraryUnavailable` is `true`, cleanly hide or show a muted disabled note for the reusable library selector instead of rendering an error.

- **Preserve all existing Slice 1B dialog behavior verbatim:** keep all existing props, exports, `z-50` layering, `sessionRef` upload-race guard, `committedStagingPathsRef` staging-cleanup guard, `removeUnsentStagingObject` on cancel, `defaultAttachment` handling, and quotation placeholder chips `{{quotation_number}}`, `{{quotation_total}}`, `{{valid_until}}`).

### 3. Gate `src/components/settings/WhatsAppLibraryManager.tsx` (and Audit All Callers)

- Read `settings` from `useWhatsAppSettings()` and compute `const isModuleEnabled = Boolean(settings?.module_enabled);`.

- Call `useWhatsAppLibrary({ enabled: isAdmin && isModuleEnabled })`.

- When `!isModuleEnabled` or `libraryUnavailable` is `true`, render a calm muted notice inside the Card (e.g., *"Enable the WhatsApp module after backend setup to manage the reusable media library."*) instead of querying `wa_library_list` or showing a red toast.

- Search all of `src/` for any other reference to `useWhatsAppLibrary` or `wa_library_list` and apply the same `module_enabled` + lazy-load gate if any exist.

## Code Quality & Invariants

- Write complete, compilable TypeScript/React files with zero truncation or placeholder comments.

- Keep strict compatibility with `tsconfig.app.json` (zero new TypeScript errors).

- Preserve all `full_name` staff attribution rules.

## Verification Contract (Done When)

After applying edits, report the exact changed file list and confirm all 6 binary checks:

1. Zero files under `supabase/` or `services/` were created or modified, and zero SQL statements were run.

2. `package.json`, lockfiles, `src/lib/whatsappMedia.ts`, `src/lib/quotationPdf.ts`, and `src/hooks/useWhatsAppMessages.ts` are untouched.

3. Loading a Lead profile while `module_enabled` is `false` makes **0** calls to `wa_library_list` and shows **0** red error toasts.

4. Opening `Settings -> WhatsApp` while `module_enabled` is `false` makes **0** calls to `wa_library_list` and renders the neutral disabled notice in `WhatsAppLibraryManager`.

5. When `module_enabled` is `true`, opening `SendWhatsAppDialog` lazily loads `wa_library_list` only when `open === true`, and `WhatsAppLibraryManager` loads normally for admins.

6. TypeScript check and Vite production build pass with zero new errors.