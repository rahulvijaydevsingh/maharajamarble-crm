# CRM Backup & Disaster Recovery (DR) Operational Runbook

This document describes the operational behavior, capabilities, and procedures for the CRM Backup and Disaster Recovery system as implemented.

---

## 1. Objectives & Capabilities

### Recovery Point Objective (RPO)
- **RPO is not fixed.**
- Backup creation is triggered manually via the UI. There is currently no automated cron schedule creating backups automatically.
- The effective RPO corresponds to the elapsed time since an administrator last initiated a manual backup ("Start Backup").
- **Recommended Practice:** Operational administrators should manually trigger a full backup on a regular cadence (e.g., weekly or prior to major database operations) as a stopgap.

### Recovery Time Objective (RTO)
- **RTO is on the order of minutes** for a merge/upsert restore once a backup `.zip` or manifest is selected.
- Restoration velocity depends on network bandwidth and dataset size, as processing occurs client-side in the browser.

---

## 2. Creating a Backup (Manual Procedure)

1. **Location:** Navigate to **Settings** > **Backup & Restore** > **Create Backup** tab.
2. **Module Selection:**
   - Select individual modules (e.g., *Leads*, *Customers*, *Tasks*, *Quotations*) or click **Complete Backup (recommended)** to select all available modules.
   - Option: Toggle **Include attachment files** to include stored file objects alongside database JSON/CSV exports.
3. **Execution Mechanism:**
   - Clicking **Start Backup** initializes a background job on the server (`backup_jobs` table).
   - The worker exports modules sequentially table-by-table. Duration will vary with data volume; check the completed backup's actual duration once telemetry populates.
4. **Monitoring & Triage:**
   - Progress and current tables being exported are rendered in the **Recent Backups** list.
   - If a backup remains stuck in `processing` status for several hours, refer to **Section 4: Triage**.

---

## 3. Restoring Data

1. **Location:** Navigate to **Settings** > **Backup & Restore** > **Restore** tab.
2. **Backup Source Selection:**
   - **From Recent Backups:** Select any completed backup job from the dropdown (must have a valid manifest and downloadable `.zip`). Pruned or manually deleted rows are inert and cannot be restored.
   - **Upload File:** Alternatively, upload a previously downloaded backup `.zip` archive directly from your local machine.
3. **Restore Semantics (Crucial Limits):**
   - **Merge / Upsert Only:** The restore engine executes `upsert` queries based on primary keys. It inserts missing records and updates existing matching records. **It does not delete or remove any existing database records** that are absent from the backup file. There is no "replace/wipe" mode.
   - **Browser-Based Execution:** Restore operations run entirely within the user's browser session using client-side JSZip parsing and API batching. The browser tab **must remain open** until restoration completes; if interrupted or closed, the restore process will stop partway without automatic resumption.
   - **Permissions:** The restoration runs under the authenticated admin user's active session permissions (RLS), not as a separate elevated system service.

---

## 4. Triage: Stuck or Failed Backups

- **Stuck `processing` Status (> 4 Hours):**
  - Background backup workers use a self-chaining table export process. If a network error or edge function execution timeout occurs, a job may freeze in `processing`.
  - The retention edge function includes an automated reaper that auto-fails jobs remaining in `processing` for longer than 4 hours. If immediate action is needed, administrators can trigger a fresh backup job.
- **Integrity Status `failed`:**
  - Backup jobs perform a SHA-256 checksum and zip integrity validation upon completion.
  - If a job displays an **Integrity: Failed** badge, treat the backup as corrupted or unreliable for restoration. Do not rely on it for disaster recovery; create a fresh manual backup immediately.

---

## 5. Retention & Pruning

1. **Settings:** Retention policy keep limits (Daily, Weekly, Monthly GFS tiers) are configured under **Retention Policy Settings**.
2. **Execution Tools:**
   - **Preview Retention Pruning (Dry-Run):** Simulates retention rules and displays candidate backups eligible for deletion without removing any files.
   - **Run Retention Now:** Triggers an immediate bulk pruning run (`{ dry_run: false }`). Candidates are calculated live, and a confirmation dialog displays the exact count of backups to be pruned before execution.
3. **Automated Retention Note:**
   - Neither retention pruning nor backup creation currently runs on an automated schedule. Both actions must be manually initiated by an administrator via the control panel.
