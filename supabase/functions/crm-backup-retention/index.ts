import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function listPrefixFiles(admin: any, folder: string): Promise<string[]> {
  const storage = admin.storage.from("crm-backups");
  const allFiles: string[] = [];

  async function walk(currentFolder: string): Promise<void> {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await storage.list(currentFolder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Storage list failed for ${currentFolder}: ${error.message}`);
      const entries = data || [];
      for (const entry of entries) {
        const path = `${currentFolder}/${entry.name}`;
        if (entry.id) allFiles.push(path);
        else await walk(path);
      }
      if (entries.length < pageSize) break;
      offset += pageSize;
    }
  }

  await walk(folder.replace(/\/$/, ""));
  return allFiles;
}

async function deletePrefixStorageFiles(admin: any, prefix: string): Promise<string[]> {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  if (!/^backups\/[0-9a-f-]{36}$/i.test(normalizedPrefix)) {
    throw new Error(`Refusing unsafe backup storage prefix: ${prefix}`);
  }
  const before = await listPrefixFiles(admin, normalizedPrefix);
  const storage = admin.storage.from("crm-backups");
  for (let i = 0; i < before.length; i += 1000) {
    const batch = before.slice(i, i + 1000);
    const { error } = await storage.remove(batch);
    if (error) throw new Error(`Storage remove failed under ${normalizedPrefix}: ${error.message}`);
  }
  const after = await listPrefixFiles(admin, normalizedPrefix);
  if (after.length !== 0) {
    throw new Error(`Backup deletion is incomplete under ${normalizedPrefix}: ${after.length} object(s) remain.`);
  }
  return before;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createAdminClient();

  const cronSecretHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  let deletedBy = "system_retention_cron";
  let isAuthed = Boolean(cronSecretHeader && expectedCronSecret && cronSecretHeader === expectedCronSecret);

  if (!isAuthed) {
    const auth = await requireAdmin(req);
    if (auth.ok) {
      isAuthed = true;
      const { data: profile, error } = await admin.from("profiles").select("full_name")
        .eq("id", auth.userId).maybeSingle();
      if (error) return jsonResponse({ error: error.message }, { status: 500 });
      deletedBy = profile?.full_name || auth.userEmail || auth.userId;
    }
  }
  if (!isAuthed) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson<{ dry_run?: boolean }>(req);
  const isDryRun = body.dry_run === true;

  try {
    // Fail-safe stale-job cleanup: storage must be empty before the job is marked failed.
    const staleCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: staleJobs, error: staleError } = await admin.from("backup_jobs")
      .select("id, storage_prefix").eq("status", "processing").lt("updated_at", staleCutoff);
    if (staleError) throw new Error(`Could not read stale backup jobs: ${staleError.message}`);
    const staleCleanupErrors: Array<{ id: string; error: string }> = [];
    for (const stale of staleJobs || []) {
      try {
        const prefix = stale.storage_prefix || `backups/${stale.id}/`;
        if (!isDryRun) {
          const deleted = await deletePrefixStorageFiles(admin, prefix);
          const { error: updateError } = await admin.from("backup_jobs").update({
            status: "failed",
            error_message: "Auto-failed after 4-hour timeout; incomplete storage prefix removed and verified.",
            updated_at: new Date().toISOString(),
          }).eq("id", stale.id);
          if (updateError) throw new Error(`Could not mark stale job ${stale.id} failed: ${updateError.message}`);

          if (deleted.length > 0) {
            const { error: logError } = await admin.from("backup_deletion_log").insert({
              backup_job_id: stale.id,
              deleted_by: deletedBy,
              deletion_reason: "stale_processing_cleanup",
              files_deleted: deleted,
            });
            if (logError) throw new Error(`Could not log stale backup cleanup ${stale.id}: ${logError.message}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Stale backup cleanup failed for ${stale.id}; continuing with remaining jobs and GFS retention:`, error);
        staleCleanupErrors.push({ id: stale.id, error: message });
        // Persist the error without changing updated_at, so an unsuccessful stale
        // cleanup remains eligible for another attempt on the next retention run.
        const { error: recordError } = await admin.from("backup_jobs").update({
          error_message: `Stale cleanup attempt failed: ${message}`,
        }).eq("id", stale.id).eq("status", "processing");
        if (recordError) console.error(`Could not record stale cleanup error for ${stale.id}:`, recordError);
      }
    }

    const { data: settings, error: settingsError } = await admin.from("backup_retention_settings")
      .select("*").eq("id", true).maybeSingle();
    if (settingsError || !settings) throw new Error(settingsError?.message || "Backup retention settings are missing.");
    if (!settings.is_enabled) {
      return jsonResponse({ message: "Backup retention engine is disabled", is_enabled: false });
    }

    const { data: jobs, error: jobsError } = await admin.from("backup_jobs")
      .select("id, status, is_pinned, backup_tier, created_at, total_size_bytes, storage_prefix, zip_path, manifest_path")
      .eq("status", "completed").eq("is_pinned", false).order("created_at", { ascending: false });
    if (jobsError) throw new Error(`Could not read completed backups: ${jobsError.message}`);
    if (!jobs || jobs.length === 0) return jsonResponse({ message: "No completed, unpinned backups to evaluate", candidates_for_pruning: [] });

    const newestJob = jobs[0];
    const remainingJobs = jobs.slice(1);
    const seenMonths = new Set<string>();
    const seenWeeks = new Set<string>();
    const dailyBucket: any[] = [];
    const weeklyBucket: any[] = [];
    const monthlyBucket: any[] = [];
    const tierUpdates: Array<{ id: string; tier: string }> = [];

    for (const job of remainingJobs) {
      const dt = new Date(job.created_at);
      const monthKey = getMonthKey(dt);
      const weekKey = getIsoWeekKey(dt);
      let tier = "daily";
      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey); seenWeeks.add(weekKey); tier = "monthly"; monthlyBucket.push(job);
      } else if (!seenWeeks.has(weekKey)) {
        seenWeeks.add(weekKey); tier = "weekly"; weeklyBucket.push(job);
      } else dailyBucket.push(job);
      if (job.backup_tier !== tier) tierUpdates.push({ id: job.id, tier });
    }

    if (!isDryRun) {
      for (const patch of tierUpdates) {
        const { error } = await admin.from("backup_jobs").update({
          backup_tier: patch.tier, updated_at: new Date().toISOString(),
        }).eq("id", patch.id);
        if (error) throw new Error(`Could not update GFS tier for ${patch.id}: ${error.message}`);
      }
    }

    const dailyPrune = dailyBucket.slice(settings.daily_keep ?? 7);
    const weeklyPrune = weeklyBucket.slice(settings.weekly_keep ?? 4);
    const monthlyPrune = monthlyBucket.slice(settings.monthly_keep ?? 6);
    const candidates = [
      ...dailyPrune.map((job) => ({ ...job, tier: "daily" })),
      ...weeklyPrune.map((job) => ({ ...job, tier: "weekly" })),
      ...monthlyPrune.map((job) => ({ ...job, tier: "monthly" })),
    ];

    if (isDryRun) {
      return jsonResponse({
        dry_run: true, protected_newest_id: newestJob.id, candidates_count: candidates.length,
        candidates: candidates.map((job) => ({
          id: job.id, tier: job.tier, created_at: job.created_at, total_size_bytes: job.total_size_bytes,
        })),
      });
    }

    const pruned: Array<{ id: string; tier: string; files_deleted: number }> = [];
    for (const candidate of candidates) {
      const prefix = candidate.storage_prefix || `backups/${candidate.id}/`;
      const deleted = await deletePrefixStorageFiles(admin, prefix);

      // Avoid duplicate audit rows if a prior attempt logged successfully but the job update failed.
      const { data: existingLog, error: logReadError } = await admin.from("backup_deletion_log")
        .select("id").eq("backup_job_id", candidate.id).eq("deletion_reason", "retention").limit(1).maybeSingle();
      if (logReadError) throw new Error(`Could not check deletion log for ${candidate.id}: ${logReadError.message}`);
      if (!existingLog) {
        const { error: logError } = await admin.from("backup_deletion_log").insert({
          backup_job_id: candidate.id,
          backup_tier: candidate.tier,
          backup_created_at: candidate.created_at,
          deleted_by: deletedBy,
          deletion_reason: "retention",
          files_deleted: deleted,
        });
        if (logError) throw new Error(`Could not log verified deletion for ${candidate.id}: ${logError.message}`);
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await admin.from("backup_jobs").update({
        status: "pruned", zip_path: null, manifest_path: null, pruned_at: now, updated_at: now,
      }).eq("id", candidate.id).eq("status", "completed").select("id").maybeSingle();
      if (updateError || !updated) {
        throw new Error(`Storage was removed and verified, but backup job ${candidate.id} could not be marked pruned: ${updateError?.message || "job status changed concurrently"}`);
      }
      pruned.push({ id: candidate.id, tier: candidate.tier, files_deleted: deleted.length });
    }

    return jsonResponse({ status: "success", pruned_count: pruned.length, pruned, stale_cleanup_errors: staleCleanupErrors });
  } catch (error) {
    console.error("Error in crm-backup-retention:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
