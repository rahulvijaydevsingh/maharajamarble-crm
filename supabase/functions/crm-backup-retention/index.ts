import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

/**
 * Helper to extract ISO week key: YYYY-Www (e.g. 2026-W12)
 */
function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Helper to extract Month key: YYYY-MM (e.g. 2026-03)
 */
function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Helper to safely delete all files under a storage prefix in `crm-backups`
 */
async function deletePrefixStorageFiles(admin: any, prefix: string): Promise<string[]> {
  const deletedFiles: string[] = [];
  try {
    const { data: files, error: listErr } = await admin.storage.from("crm-backups").list(prefix.replace(/\/$/, ""), {
      limit: 100,
      offset: 0,
    });
    if (!listErr && files && files.length > 0) {
      const pathsToDelete = files.map((f: any) => `${prefix}${f.name}`);
      const { data: removed } = await admin.storage.from("crm-backups").remove(pathsToDelete);
      if (removed) {
        deletedFiles.push(...removed.map((r: any) => r.name || r));
      }
    }

    // Also check tables subdirectory if it exists
    const tablesPrefix = `${prefix}tables`;
    const { data: tableFiles, error: tableListErr } = await admin.storage.from("crm-backups").list(tablesPrefix, {
      limit: 500,
    });
    if (!tableListErr && tableFiles && tableFiles.length > 0) {
      const tablePathsToDelete = tableFiles.map((f: any) => `${tablesPrefix}/${f.name}`);
      const { data: removedTables } = await admin.storage.from("crm-backups").remove(tablePathsToDelete);
      if (removedTables) {
        deletedFiles.push(...removedTables.map((r: any) => r.name || r));
      }
    }
  } catch (err) {
    console.error(`Error deleting storage files for prefix ${prefix}:`, err);
  }
  return deletedFiles;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createAdminClient();

  // Auth logic:
  // 1. Check x-cron-secret header matching CRON_SECRET env var
  // 2. Or check authenticated admin JWT via requireAdmin(req)
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");

  let deletedBy = "system_retention_cron";
  let isAuthed = false;

  if (cronSecretHeader && expectedCronSecret && cronSecretHeader === expectedCronSecret) {
    isAuthed = true;
    deletedBy = "system_retention_cron";
  } else {
    const adminAuth = await requireAdmin(req);
    if (adminAuth.ok) {
      isAuthed = true;
      // Get admin profile name if available
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", adminAuth.userId)
        .maybeSingle();

      deletedBy = profile?.full_name || adminAuth.userEmail || adminAuth.userId;
    }
  }

  if (!isAuthed) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJson<{ dry_run?: boolean }>(req);
  const isDryRun = body.dry_run === true;

  try {
    // 1. Stale job reaper (failsafe for processing jobs stuck > 4 hours)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: staleJobs } = await admin
      .from("backup_jobs")
      .select("id, storage_prefix")
      .eq("status", "processing")
      .lt("updated_at", fourHoursAgo);

    if (staleJobs && staleJobs.length > 0) {
      for (const stale of staleJobs) {
        const prefix = stale.storage_prefix || `backups/${stale.id}/`;
        await deletePrefixStorageFiles(admin, prefix);

        await admin
          .from("backup_jobs")
          .update({
            status: "failed",
            error_message: "Auto-failed after 4-hour timeout (stale processing reaper)",
            updated_at: new Date().toISOString(),
          })
          .eq("id", stale.id);
      }
    }

    // 2. Read settings
    const { data: settings, error: settingsErr } = await admin
      .from("backup_retention_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (settingsErr || !settings) {
      return jsonResponse({ error: "Failed to read retention settings" }, { status: 500 });
    }

    if (!settings.is_enabled) {
      return jsonResponse({
        message: "Backup retention engine is disabled",
        is_enabled: false,
      });
    }

    // 3. Gather candidates
    const { data: jobs, error: jobsErr } = await admin
      .from("backup_jobs")
      .select("id, status, is_pinned, created_at, total_size_bytes, storage_prefix, zip_path, manifest_path")
      .eq("status", "completed")
      .eq("is_pinned", false)
      .order("created_at", { ascending: false });

    if (jobsErr) {
      return jsonResponse({ error: jobsErr.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return jsonResponse({
        message: "No completed, unpinned backups found for retention evaluation",
        candidates_for_pruning: [],
      });
    }

    // 4. Protect the single newest completed unpinned row
    const newestJob = jobs[0];
    const remainingJobs = jobs.slice(1);

    // 5. Classify remaining jobs into GFS tiers
    const seenMonths = new Set<string>();
    const seenWeeks = new Set<string>();

    const dailyBucket: typeof remainingJobs = [];
    const weeklyBucket: typeof remainingJobs = [];
    const monthlyBucket: typeof remainingJobs = [];

    const tierUpdates: Array<{ id: string; tier: string }> = [];

    for (const job of remainingJobs) {
      const dt = new Date(job.created_at);
      const monthKey = getMonthKey(dt);
      const weekKey = getIsoWeekKey(dt);

      let computedTier = "daily";

      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);
        seenWeeks.add(weekKey);
        computedTier = "monthly";
        monthlyBucket.push(job);
      } else if (!seenWeeks.has(weekKey)) {
        seenWeeks.add(weekKey);
        computedTier = "weekly";
        weeklyBucket.push(job);
      } else {
        dailyBucket.push(job);
      }

      tierUpdates.push({ id: job.id, tier: computedTier });
    }

    // Update backup_tier in database for classified jobs
    if (!isDryRun) {
      for (const patch of tierUpdates) {
        await admin
          .from("backup_jobs")
          .update({
            backup_tier: patch.tier,
            updated_at: new Date().toISOString(),
          })
          .eq("id", patch.id);
      }
    }

    // 6. Apply keep counts
    const dailyKeep = settings.daily_keep ?? 7;
    const weeklyKeep = settings.weekly_keep ?? 4;
    const monthlyKeep = settings.monthly_keep ?? 6;

    const dailyToPrune = dailyBucket.slice(dailyKeep);
    const weeklyToPrune = weeklyBucket.slice(weeklyKeep);
    const monthlyToPrune = monthlyBucket.slice(monthlyKeep);

    const candidatesForPruning = [
      ...dailyToPrune.map((j) => ({ ...j, tier: "daily" })),
      ...weeklyToPrune.map((j) => ({ ...j, tier: "weekly" })),
      ...monthlyToPrune.map((j) => ({ ...j, tier: "monthly" })),
    ];

    // 7. Dry-run vs Real
    if (isDryRun) {
      return jsonResponse({
        dry_run: true,
        protected_newest_id: newestJob.id,
        candidates_count: candidatesForPruning.length,
        candidates: candidatesForPruning.map((c) => ({
          id: c.id,
          tier: c.tier,
          created_at: c.created_at,
          total_size_bytes: c.total_size_bytes,
        })),
      });
    }

    // Real pruning execution
    const prunedResults = [];
    for (const candidate of candidatesForPruning) {
      const prefix = candidate.storage_prefix || `backups/${candidate.id}/`;
      const deletedFiles = await deletePrefixStorageFiles(admin, prefix);

      const nowIso = new Date().toISOString();
      await admin
        .from("backup_jobs")
        .update({
          status: "pruned",
          zip_path: null,
          manifest_path: null,
          pruned_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", candidate.id);

      await admin.from("backup_deletion_log").insert({
        backup_job_id: candidate.id,
        backup_tier: candidate.tier,
        backup_created_at: candidate.created_at,
        deleted_by: deletedBy,
        deletion_reason: "retention",
        files_deleted: deletedFiles,
      });

      prunedResults.push({ id: candidate.id, tier: candidate.tier });
    }

    return jsonResponse({
      status: "success",
      pruned_count: prunedResults.length,
      pruned: prunedResults,
    });
  } catch (err) {
    console.error("Error in crm-backup-retention:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
