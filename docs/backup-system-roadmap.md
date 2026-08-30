# CRM Backup System Architectural Roadmap & Decision Log

This document records key architectural decisions, deferred scope, and future considerations for the CRM Backup & Disaster Recovery system.

---

## 1. Phase 5: Dedicated Settings API (Skipped)
- **Status:** Skipped (not deferred).
- **Rationale:** The `backup_retention_settings` table relies on PostgreSQL Row-Level Security (RLS) policies that permit reads for authenticated users while enforcing admin-only writes directly at the database level. Implementing a dedicated Edge Function API endpoint for settings management would only duplicate checks already enforced natively by RLS.

---

## 2. Phase 6: Scheduled Automation (Deferred)
- **Status:** Deferred.
- **Identified Gaps:** Neither backup creation nor retention/pruning currently runs on an automated schedule; both require manual trigger actions in the UI.
- **Root Cause Analysis:**
  - On **2026-08-04**, the project's Supabase `pg_cron` extension stopped executing scheduled jobs entirely (after operating reliably for ~52 days).
  - This execution freeze is directly linked to hosting environment constraints: projects on the Supabase Free Tier auto-pause during periods of inactivity, which can desynchronize or disable background `pg_cron` workers upon resumption.
- **Current Decision:** Moving to a paid hosting tier to restore `pg_cron` functionality is not being pursued at this time. This work will be revisited if automated scheduling becomes a hard requirement in production.

---

## 3. Restore Mechanism Architectural Limitations
For future engineering initiatives considering enhancements to data recovery:
- **Client-Side Processing:** The active restore engine (`useCrmBackups.ts`) processes files and dispatches network requests entirely within the administrator's browser.
- **Merge/Upsert Only:** Restoration executes primary-key `upsert` queries. It adds missing rows and updates existing rows, but cannot perform full database wipes or deletions of records created since the backup date.
- **Non-Resumable:** If the browser tab is closed or interrupted mid-restore, execution halts and cannot be resumed from the interruption point.
- **User Session Context:** Operations run using the signed-in admin's auth JWT and RLS permissions rather than a service-role background process.
- **Future Scope:** Implementing a server-side, resumable, replace-capable restore mechanism represents significant architectural hardening for future development rounds.

---

## 4. Legacy Tables Retention (`crm_backups_legacy` & `crm_restores_legacy`)
- **Status:** Renamed and retained for forensic reference.
- **Details:** In Phase 1, original legacy backup tables were renamed to `crm_backups_legacy` and `crm_restores_legacy` rather than dropped.
- **Recommendation:** These tables contain static historical data and are safe to drop completely once confirmed that historical forensic audit logs are no longer required.
