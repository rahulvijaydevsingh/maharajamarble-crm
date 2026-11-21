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
