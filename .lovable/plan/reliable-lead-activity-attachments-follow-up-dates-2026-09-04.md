# Reliable Lead Activity Attachments & Follow-up Dates

## Verified findings

- **Lead `d65aaa7c-3368-491c-a8e8-d9649bcff21e` (Bhupinder gill)** exists with `last_follow_up = NULL`, `next_follow_up = 06 Sep 2026`, and a manual **Showroom Visit** at `04 Sep 2026 · 12:56 PM`.
- The Showroom Visit’s `activity_log.attachments` JSON contains two entries with only `name`, `size`, and `type`. There is no storage path, no lead attachment record, and no matching object in the private `crm-attachments` bucket. The original file bytes were never uploaded, so those two historical files cannot be previewed or downloaded from the CRM.
- The timeline renders attachment metadata as static badges. The lead’s Attachments tab reads only `entity_attachments`, which explains why it lists neither activity file.
- The current task-only follow-up trigger does not observe activity log inserts, edits, or deletes. It also counts system `task_snoozed` and task-attempt events, which conflicts with the requested definition of a genuine follow-up.

## Implementation

1. **Make activity uploads real and atomic from the user’s perspective**
  - Upload selected manual-activity files into the existing private `crm-attachments` bucket before saving the activity.
  - Create lead/customer/professional `entity_attachments` rows using the existing attachment pipeline, and save stable attachment references (`id`, `file_path`, MIME type, size, display name) into `activity_log.attachments`.
  - If an activity insert fails after an upload, remove the just-uploaded storage objects and attachment rows; if a file upload fails, do not create the activity.
  - Keep the current file limits and accepted formats, and retain compatibility for existing JSON-only attachment metadata.
2. **Create a complete lead attachment repository without breaking direct uploads**
  - Extend the existing attachment model with optional source metadata for origin (`activity`, `task`, `note`, or direct upload), source id, and a human-readable source label.
  - Populate source metadata for new activity-origin files and expose it in the Attachments tab as “Via activity: [activity title]”.
  - Keep attachment records independent from activity records: deleting an activity will not delete its lead files. Direct-upload, task, and existing attachment flows continue to work unchanged.
  - Upgrade attachment deletion to remove both the database row and the associated private storage object, with safe error handling and user feedback.
3. **Add secure activity attachment actions and previews**
  - Replace static attachment badges with interactive attachment controls where a stored path exists: click/view opens images and PDFs in an accessible in-app preview dialog; other files open through a short-lived signed URL in a new tab.
  - Add compact View and Download actions, tooltips, keyboard access, hover affordance, and a graceful missing/unavailable-file state.
  - Reuse signed URLs and existing `crm-attachments` access rules; never expose a public bucket URL.
  - Legacy JSON-only chips remain visible, but are labelled unavailable rather than falsely offering view/download actions.
4. **Make `last_follow_up` accurate and self-healing**
  - Introduce one database-side recalculation function for a lead’s follow-up dates, using the event timestamp—not record creation time.
  - Qualify only manual/contact activities (`phone_call`, `meeting`, `site_visit`, `showroom_visit`, `email_sent`, and any explicitly approved communication type) plus completed tasks. Exclude snoozes, creation/updates, status changes, automated activity, notes, and task attempts.
  - Add an `activity_log` trigger for insert, update, and delete, including reassignment between leads. Update the existing task synchronization to call the shared calculation, so task and activity changes cannot overwrite each other with competing rules.
  - Recompute the newest eligible event on edits/deletes and preserve the existing pending-task logic for `next_follow_up`.
5. **Backfill and validate safely**
  - Backfill source metadata only for files that already have `entity_attachments` rows; do not fabricate paths for metadata-only legacy activity entries.
  - Recompute `last_follow_up` across existing leads from qualifying activities and completed tasks.
  - Explicitly verify the reference lead afterwards: Profile shows `04 Sep 2026`; the two legacy image entries remain visible but unavailable because their bytes do not exist in storage.
  - Verify new manual activity uploads end-to-end: storage object, attachment row, timeline preview/download, source label in Attachments, and last-follow-up update. Exercise activity edit/delete and attachment deletion paths to ensure the recalculation and file ownership rules hold.

## Technical details

- **Database:** migrate `entity_attachments` with nullable provenance fields; add a shared SECURITY DEFINER recalculation function and narrow triggers on `activity_log` and `tasks`. Existing `entity_attachments` RLS and private-bucket signed URL access remain enforced; policies will be updated only if the new provenance write needs it.
- **Frontend:** update the manual activity dialog, `useActivityLog`, activity timeline item, and shared entity attachment hook/tab. Use the existing Supabase client, shadcn dialogs/buttons, and toast system.
- **Historical limitation:** the two named WhatsApp images were never placed in Supabase Storage. They can only become viewable if the original image files are re-uploaded; the migration will not invent broken file links.  
  
  
ADDENDUM TO THE PLAN (required modifications):
  M1 — Legacy metadata-only attachments MUST also appear in the Attachments tab:
  For legacy activity attachments that exist only as JSON metadata (name/size/type) with no storage object (e.g. the two WhatsApp images on lead d65aaa7c), also create entity_attachments rows with file_path = NULL and an availability flag (e.g. storage_missing = true / is_available = false), linked to the lead with source metadata ("Via activity: Showroom Visit"), using the activity's creator and timestamp for uploaded_by/created_at. They must appear in the Attachments tab labelled "Unavailable — file not in storage", with View/Download safely disabled and Delete working (deleting a metadata-only row must not attempt a storage delete). This keeps the original requirement "all attachments show up in the attachments section" true for legacy data without inventing broken links. Update acceptance criterion #2 accordingly: the Attachments tab of lead d65aaa7c lists both WhatsApp images (marked unavailable).
  M2 — Explicit qualifying activity-type mapping:
  Before implementing, run SELECT DISTINCT on the activity type column of activity_log and publish the exact COUNT vs EXCLUDE mapping in the fix summary. Every manual/contact type actually used by the team must count (phone_call, meeting, site_visit, showroom_visit, email_sent, whatsapp/message types, and any other custom manual contact types found in the data); system events (snoozes, creations, status changes, automated entries, task attempts) stay excluded. Keep this mapping in ONE central place (constant/config inside the recalculation function) so future activity types can be added without schema changes.
  M3 (OPTIONAL, nice-to-have) — Re-link missing files:
  Add a "Re-upload / Re-link file" action on unavailable attachments that uploads the original file, fills in the missing storage object/path, and flips the availability flag so the chip becomes viewable/downloadable in both the timeline and the Attachments tab. This lets users restore legacy files like the two WhatsApp images on lead d65aaa7c.