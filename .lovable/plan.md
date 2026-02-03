
Goal
- Add a “Backup & Restore” system to the CRM that:
  - Lets an admin choose what to include/exclude via a checklist (and a “Complete backup” preset).
  - Produces both JSON (for exact restore) and Excel (for human viewing).
  - Restores from a backup with a clear choice between Merge vs Replace, with strong warnings.
  - Includes “everything” in scope: leads/customers/tasks/reminders/automation/users/roles/Quotations/communications + attachments/files.
  - Is reliable for larger datasets (avoids client-side 1000-row limits and RLS constraints).

Non-goals / important constraints
- We will NOT store any files inside database columns. Backup files will be stored in secure file storage (private bucket) and/or downloaded to the user.only admins can backup and restore.
- “Users” in a CRM backup has two layers:
  1) Profile + role assignments (profiles/user_roles/custom permissions) — we can back up and restore these.
  2) Actual login accounts (auth users) — these can’t be fully recreated automatically without setting passwords. For restores into the SAME backend instance this is fine; for restoring into a different backend instance, we will provide a guided step to recreate staff accounts and then re-link roles by email.

High-level UX
1) Settings → add a new tab: “Backup & Restore”
2) Two sections:
   A) Create Backup
   - Checklist with presets:
     - “Complete Backup (recommended)” (preselects everything)
     - “Custom”
   - Module checklist (with tooltips):
     - Leads
     - Customers
     - Professionals
     - Tasks (includes subtasks, snooze history, task activity, completion templates if present)
     - Reminders
     - Calendar events (if present)
     - Automation (rules, templates, settings, executions/logs)
     - Communication (messages, conversations, announcements, announcement_reads)
     - Users & Access (profiles, user_roles, custom_role_permissions)
     - Company & System settings (company_settings, control panel tables, saved_filters, etc.)
     - Attachments/files (entity_attachments, quotation_attachments, message file references + actual stored objects)
   - Output formats (fixed by your request):
     - JSON + Excel
   - Create button → shows progress + generates a “Backup Report” (counts, file links, warnings)
   - “Download JSON” and “Download Excel” buttons
   - “Copy restore code / notes” (optional small helper that copies any warnings)

   B) Restore Backup
   - Upload JSON backup file OR select from “Previously generated backups” list
   - Checklist: which modules to restore (default = same as backup file contents)
   - Restore Mode:
     - Merge (safe default): upsert-by-id for chosen modules
     - Replace (destructive): deletes chosen modules’ rows first (in dependency order) then inserts
   - Warning confirmation gate:
     - Replace requires typing a confirmation phrase (e.g. RESTORE) and shows “what will be deleted”
   - Restore button → shows progress + “Restore Report” (what changed, what failed, what was skipped)

Architecture decision (important)
- Implement backup/restore primarily as backend functions (server-side), not in the browser.
  Why:
  - Avoids query limits and performance issues
  - Avoids RLS headaches
  - Allows copying attachment files in storage safely
  - Enables progress tracking and retry

Backend data model (new tables)
1) crm_backups
- id (uuid)
- created_at
- created_by (email or user id)
- status: queued | running | success | failed
- include_modules (jsonb) – what was selected
- formats (jsonb) – always json + xlsx, but stored for future
- result_summary (jsonb) – counts per table/module, warnings
- json_file_path (text)
- xlsx_file_path (text)
- log (text or jsonb) – optional

2) crm_restores
- id (uuid)
- created_at
- created_by
- status: queued | running | success | failed
- mode: merge | replace
- include_modules (jsonb)
- source_backup_id (uuid nullable)
- source_file_path (text nullable)
- result_summary (jsonb)
- log (text or jsonb)

RLS
- Only admin roles can create/list/download backups and run restores.
- Backups and restores should be visible only to admins (and optionally the creator).

Storage
- Create a new private bucket: crm-backups
- Store generated files under paths like:
  - backups/<backupId>/backup.json
  - backups/<backupId>/backup.xlsx
  - backups/<backupId>/files/... (if we copy attachment objects into the backup bundle)
- Use signed download URLs (time-limited) for downloads.

Backend functions (server-side)
A) create-crm-backup
Input:
- includeModules: string[]
- includeFiles: boolean
- formats: ["json","xlsx"] (fixed)
Behavior:
- Create crm_backups row (status=running)
- Discover tables to export based on modules OR “complete backup”
  - Implementation approach:
    - Maintain a module→tables mapping in code for correctness and dependency ordering.
    - Also optionally verify table existence at runtime (some deployments may differ).
- Export data table-by-table:
  - Paginate using ranges to avoid limits (e.g. 0..999, 1000..1999, etc.)
  - Save into a JSON structure:
    {
      "meta": { version, createdAt, createdBy, includeModules },
      "tables": {
        "leads": [...],
        "tasks": [...],
        ...
      }
    }
- Generate Excel workbook:
  - One sheet per table (or one per module, whichever is more readable; plan: per table)
  - Add a “README” sheet (restore notes + warnings + version)
- Attachments/files handling (if includeFiles):
  - Collect referenced file paths from:
    - entity_attachments.file_path
    - quotation_attachments.file_path
    - messages.file_url/file_name (if used)
  - Copy each referenced object from the attachments bucket into crm-backups under backups/<backupId>/files/...
  - Record a “files manifest” in JSON with original path → backup path
  - Note: If there are many files, this can be slow; we’ll show progress and allow “metadata-only” backups as an option later (but for now we’ll implement full copy since you requested attachments/files).
- Upload backup.json and backup.xlsx into crm-backups
- Update crm_backups with file paths, status=success, result_summary
On failure:
- status=failed + log error

B) list-crm-backups
- Returns the last N backups with status and createdAt + who created it.

C) restore-crm-backup
Input:
- source: { backupId } OR { uploadedJsonPath }
- mode: merge | replace
- includeModules: string[]
Behavior:
- Create crm_restores row (status=running)
- Load JSON from storage (or from selected backup record)
- Validate:
  - version compatibility
  - required tables for selected modules exist in JSON
- Execute restore per module in safe order.
  - For Replace:
    - Delete rows in dependency order (children first).
    - Then insert rows (parents first).
  - For Merge:
    - Upsert by primary key (id) where possible.
    - For join tables or unique constraints, use upsert on conflict keys.
- Users & roles special handling:
  - profiles/user_roles/custom_role_permissions can be restored by ID for same-backend restores.
  - If restoring into a different backend instance, profile IDs will not match newly created auth accounts. We will:
    - Detect mismatch (no auth user for profile.id)
    - Provide a restore report listing emails that need staff accounts created
    - Provide an assisted “Re-link roles by email” step (optional Phase 2 enhancement)
- Attachments/files restore:
  - If we copied files into the backup bucket, we can copy them back into the attachments bucket and reinsert attachment rows.
  - If files already exist, we skip copying and just restore metadata.
- Update crm_restores with status=success and summary.

Safety measures & warnings
- Replace restore requires:
  - Strong UI warning modal listing affected modules and what will be deleted
  - A “type-to-confirm” input
- Backups include a version number; restore refuses incompatible major versions.
- Restore shows a dry “preflight summary” (row counts per table in backup) before executing.
- Add guardrails:
  - Prevent restoring “Users & Access” via Replace unless the current user is super_admin (reduces lockout risk)
  - Always ensure at least one super_admin remains after restore (or restore fails with guidance)

Implementation steps (what I will do next once you approve)
1) Explore & define module→table mapping
- Enumerate all CRM tables used by the app (public schema) and group them into the modules you selected.
- Define correct dependency order for replace deletes/inserts (e.g., subtasks before tasks deletes; attachments before parent entity deletes, etc.).

2) Database changes (migrations)
- Create crm_backups and crm_restores tables
- Enable RLS
- Add strict admin-only policies
- Create private storage bucket crm-backups (+ policies to allow admin access through the app)

3) Backend functions
- Implement create-crm-backup, list-crm-backups, restore-crm-backup
- Implement file-copy logic for attachments/files
- Implement chunked table export/import

4) Frontend UI
- Add “Backup & Restore” UI in Settings
- Create:
  - BackupCreatePanel (checklist + create + progress + download)
  - BackupRestorePanel (upload/select + merge/replace + warnings + progress)
  - BackupHistoryPanel (list backups, download, view report)
- Integrate toasts + success/failure states

5) Testing (end-to-end)
- Test backup creation with:
  - Small dataset
  - >1000 rows dataset (ensures pagination works)
  - Attachments present
- Test restore:
  - Merge mode: restores without deleting
  - Replace mode: deletes and restores cleanly
  - Automation + communication present
  - Verify the app still works after restore (leads, tasks, settings, staff/roles screens load)
- Test access control: non-admin cannot see the feature or run it.

Open questions resolved from your answers (recorded decisions)
- Backup should include everything (including reminders and workflow automations): yes.
- Restore should allow the user to choose Merge or Replace with warnings: yes.
- Output should be JSON + Excel: yes.

Known caveat (will be clearly shown in UI)
- Restoring “login accounts” (actual authentication users) across different backend instances cannot be done purely from backup without collecting passwords. The restore report will guide the admin to recreate staff accounts and then re-link profiles/roles. Restoring within the same backend instance works normally.

Optional Phase-2 enhancements (not required for initial delivery)
- Scheduled backups (daily/weekly) with retention policies
- Encryption-at-rest for JSON before upload (in addition to private bucket)
- “Metadata-only attachments” option for faster backups
- One-click “Duplicate environment” restore flow

Acceptance criteria
- Admin can create “Complete Backup” and download JSON + Excel.
- Admin can restore from JSON using Merge or Replace; warning gates work.
- After restore, core flows (Leads/Customers/Tasks/Automation/Settings/Messages) function without errors.
- Attachments and their links remain intact (and files can be opened).
