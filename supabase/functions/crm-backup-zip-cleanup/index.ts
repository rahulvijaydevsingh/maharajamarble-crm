import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

const MAX_JOBS_PER_RUN = 20;
const DEFAULT_JOBS_PER_RUN = 5;
const FAILED_JOB_CLEANUP_ID = "649ea45a-917e-4c4b-85d7-19d88366e05a";

function sha256Hex(data: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", data).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function getUncompressedSize(entry: any): number | null {
  const size = entry?._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

async function listPrefixFiles(admin: any, folder: string): Promise<string[]> {
  const storage = admin.storage.from("crm-backups");
  const allFiles: string[] = [];
  async function walk(currentFolder: string): Promise<void> {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await storage.list(currentFolder, {
        limit: pageSize, offset, sortBy: { column: "name", order: "asc" },
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
  await walk(folder.replace(/^\/+|\/+$/g, ""));
  return allFiles;
}

async function listTableObjects(admin: any, prefix: string) {
  const folder = `${prefix.replace(/\/$/, "")}/tables`;
  const storage = admin.storage.from("crm-backups");
  const files: Array<{ path: string; size: number }> = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await storage.list(folder, {
      limit: pageSize, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Storage list failed for ${folder}: ${error.message}`);
    const entries = data || [];
    for (const entry of entries) {
      if (entry.id && /\.(json|csv)$/i.test(entry.name)) {
        files.push({ path: `${folder}/${entry.name}`, size: Number(entry.metadata?.size || 0) });
      }
    }
    if (entries.length < pageSize) break;
    offset += pageSize;
  }
  return files;
}

async function verifyBackup(admin: any, job: any) {
  const zipPath = job.zip_path || `backups/${job.id}/backup.zip`;
  const prefix = job.storage_prefix || zipPath.replace(/backup\.zip$/i, "");
  if (!zipPath.startsWith(`backups/${job.id}/`) || !prefix.startsWith(`backups/${job.id}/`)) {
    throw new Error("Backup paths do not match the backup job ID.");
  }
  const manifestPath = job.manifest_path || `${prefix}manifest.json`;
  const storage = admin.storage.from("crm-backups");
  const [{ data: zipBlob, error: zipError }, { data: manifestBlob, error: manifestError }] = await Promise.all([
    storage.download(zipPath),
    storage.download(manifestPath),
  ]);
  if (zipError || !zipBlob) throw new Error(`backup.zip is not downloadable: ${zipError?.message || "missing"}`);
  if (manifestError || !manifestBlob) throw new Error(`manifest.json is not downloadable: ${manifestError?.message || "missing"}`);

  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
  const checksum = await sha256Hex(zipBytes);
  if (job.checksum_sha256 && job.checksum_sha256.toLowerCase() !== checksum) {
    throw new Error("Stored backup checksum does not match the downloaded ZIP.");
  }
  if (job.total_size_bytes != null && Number(job.total_size_bytes) !== zipBytes.byteLength) {
    throw new Error("Stored backup size does not match the downloaded ZIP.");
  }

  let externalManifest: any;
  try {
    externalManifest = JSON.parse(await manifestBlob.text());
  } catch {
    throw new Error("External manifest.json is not valid JSON.");
  }

  // JSZip CRC checking is retained as required. Do not call async()/JSON.parse()
  // for the table payloads: that needlessly materializes all large table exports.
  const zip = await JSZip.loadAsync(zipBlob, { checkCRC32: true });
  const internalManifestEntry = zip.file("manifest.json");
  if (!internalManifestEntry) throw new Error("ZIP is missing its own manifest.json.");
  let internalManifest: any;
  try {
    internalManifest = JSON.parse(await internalManifestEntry.async("string"));
  } catch {
    throw new Error("ZIP-internal manifest.json is not valid JSON.");
  }

  const expectedTables = Array.isArray(job.tables_to_export) ? job.tables_to_export : [];
  const completedTables = Array.isArray(job.tables_completed) ? job.tables_completed : [];
  const manifestTables = Array.isArray(externalManifest.tables) ? externalManifest.tables : [];
  if (expectedTables.length === 0 ||
      !sameList(manifestTables, expectedTables) ||
      !sameList(internalManifest.tables || [], expectedTables) ||
      Number(externalManifest.tableCount) !== expectedTables.length ||
      Number(internalManifest.tableCount) !== expectedTables.length ||
      expectedTables.some((table) => !completedTables.includes(table)) ||
      externalManifest.integrity_status !== "valid" ||
      internalManifest.integrity_status !== "valid") {
    throw new Error("Manifest integrity or backup_jobs table list is incomplete or inconsistent.");
  }
  if (!sameList(manifestTables, internalManifest.tables || [])) {
    throw new Error("External manifest and ZIP manifest disagree.");
  }

  const zipFiles = Object.values(zip.files).filter((entry: any) => !entry.dir);
  if (zipFiles.length !== 1 + expectedTables.length * 2) {
    throw new Error("ZIP has an unexpected number of files.");
  }
  for (const table of expectedTables) {
    const jsonEntry = zip.file(`tables/${table}.json`);
    const csvEntry = zip.file(`tables/${table}.csv`);
    if (!jsonEntry || !csvEntry) throw new Error(`ZIP is missing JSON/CSV members for ${table}.`);

    const jsonSize = getUncompressedSize(jsonEntry);
    const csvSize = getUncompressedSize(csvEntry);
    if (jsonSize === null || jsonSize <= 0) {
      throw new Error(`ZIP table JSON for ${table} has no measurable non-zero uncompressed size.`);
    }
    // The existing exporter emits a legitimate zero-byte CSV for an empty table.
    // In that specific case the companion JSON is the 2-byte literal [].
    if (csvSize === null || (csvSize <= 0 && jsonSize !== 2)) {
      throw new Error(`ZIP table CSV for ${table} has an invalid uncompressed size.`);
    }
  }

  return { zipPath, manifestPath, prefix, checksum, size: zipBytes.byteLength };
}

async function deletePrefixAndVerify(admin: any, prefix: string): Promise<string[]> {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  if (!/^backups\/[0-9a-f-]{36}$/i.test(normalizedPrefix)) {
    throw new Error(`Refusing unsafe backup storage prefix: ${prefix}`);
  }
  const before = await listPrefixFiles(admin, normalizedPrefix);
  const storage = admin.storage.from("crm-backups");
  for (let i = 0; i < before.length; i += 1000) {
    const { error } = await storage.remove(before.slice(i, i + 1000));
    if (error) throw new Error(`Storage remove failed under ${normalizedPrefix}: ${error.message}`);
  }
  const after = await listPrefixFiles(admin, normalizedPrefix);
  if (after.length > 0) {
    throw new Error(`Backup prefix cleanup incomplete under ${normalizedPrefix}: ${after.length} object(s) remain.`);
  }
  return before;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createAdminClient();
  const cronHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  let authorized = Boolean(cronHeader && expectedCronSecret && cronHeader === expectedCronSecret);
  if (!authorized) authorized = (await requireAdmin(req)).ok;
  if (!authorized) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson<{ dry_run?: boolean; limit?: number }>(req);
  const dryRun = body.dry_run !== false;
  const requestedLimit = Number.isInteger(body.limit) ? Number(body.limit) : DEFAULT_JOBS_PER_RUN;
  const jobLimit = Math.min(MAX_JOBS_PER_RUN, Math.max(1, requestedLimit));

  try {
    const { data: jobs, error: jobsError } = await admin.from("backup_jobs")
      .select("id,status,created_at,storage_prefix,zip_path,manifest_path,checksum_sha256,total_size_bytes,tables_to_export,tables_completed,progress")
      .eq("status", "completed").order("created_at", { ascending: true });
    if (jobsError) throw new Error(`Could not read completed backups: ${jobsError.message}`);

    const eligible: Array<{ job: any; rawFiles: Array<{ path: string; size: number }> }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const job of jobs || []) {
      const prefix = job.storage_prefix || `backups/${job.id}/`;
      const rawFiles = await listTableObjects(admin, prefix);
      const cleanupIncomplete = job.progress?.raw_files_cleanup !== "completed";
      if (rawFiles.length > 0 || cleanupIncomplete) eligible.push({ job, rawFiles });
      else skipped.push({ id: job.id, reason: "raw_files_cleanup already completed and no table exports remain" });
    }

    const jobsToProcess = eligible.slice(0, jobLimit);
    const completedResults: Array<Record<string, unknown>> = [];
    let bytesFreed = 0;
    for (const { job, rawFiles } of jobsToProcess) {
      const prefix = job.storage_prefix || `backups/${job.id}/`;
      try {
        const verified = await verifyBackup(admin, job);
        const rawBytes = rawFiles.reduce((sum, file) => sum + file.size, 0);
        if (!dryRun) {
          const { data: updated, error: validError } = await admin.from("backup_jobs").update({
            integrity_status: "valid",
            checksum_sha256: verified.checksum,
            total_size_bytes: verified.size,
            zip_path: verified.zipPath,
            manifest_path: verified.manifestPath,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("status", "completed").select("id").maybeSingle();
          if (validError || !updated) {
            throw new Error(`Verified archive but could not persist integrity state: ${validError?.message || "job status changed"}`);
          }

          for (let i = 0; i < rawFiles.length; i += 1000) {
            const { error: removeError } = await admin.storage.from("crm-backups")
              .remove(rawFiles.slice(i, i + 1000).map((file) => file.path));
            if (removeError) throw new Error(`Storage remove failed: ${removeError.message}`);
          }
          const remaining = await listTableObjects(admin, prefix);
          if (remaining.length > 0) {
            throw new Error(`Cleanup verification failed: ${remaining.length} JSON/CSV table objects remain.`);
          }
          const { error: progressError } = await admin.from("backup_jobs").update({
            progress: { ...(job.progress || {}), raw_files_cleanup: "completed" },
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          if (progressError) throw new Error(`Raw files were removed but cleanup status could not be recorded: ${progressError.message}`);
          bytesFreed += rawBytes;
        }

        completedResults.push({
          id: job.id, verified: true, zip_path: verified.zipPath,
          checksum_sha256: verified.checksum, zip_bytes: verified.size,
          raw_table_files: rawFiles.length, raw_table_bytes: rawBytes, deleted: !dryRun,
        });
      } catch (error) {
        completedResults.push({
          id: job.id, verified: false, deleted: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Failed jobs with residual files are explicitly handled separately. This also
    // covers the Sept-01 job whose 62 table exports exist but whose ZIP finalization failed.
    const { data: failedJobs, error: failedReadError } = await admin.from("backup_jobs")
      .select("id,created_at,storage_prefix,progress").eq("status", "failed")
      .order("created_at", { ascending: true });
    if (failedReadError) throw new Error(`Could not read failed backups: ${failedReadError.message}`);

    const failedResults: Array<Record<string, unknown>> = [];
    for (const failed of failedJobs || []) {
      const prefix = failed.storage_prefix || `backups/${failed.id}/`;
      try {
        const residual = await listPrefixFiles(admin, prefix);
        if (residual.length === 0) continue;
        if (dryRun) {
          failedResults.push({
            id: failed.id, files_to_delete: residual.length,
            bytes_to_delete: null, deleted: false,
            explicitly_includes_september_01_job: failed.id === FAILED_JOB_CLEANUP_ID,
          });
          continue;
        }

        const deleted = await deletePrefixAndVerify(admin, prefix);
        const { data: priorLog, error: priorLogError } = await admin.from("backup_deletion_log")
          .select("id").eq("backup_job_id", failed.id).eq("deletion_reason", "failed_job_cleanup")
          .limit(1).maybeSingle();
        if (priorLogError) throw new Error(`Could not check failed-job audit log: ${priorLogError.message}`);
        if (!priorLog) {
          const { error: logError } = await admin.from("backup_deletion_log").insert({
            backup_job_id: failed.id,
            backup_created_at: failed.created_at,
            deleted_by: "system_failed_job_cleanup",
            deletion_reason: "failed_job_cleanup",
            files_deleted: deleted,
          });
          if (logError) throw new Error(`Failed prefix removed, but its audit log insert failed: ${logError.message}`);
        }

        const { error: progressError } = await admin.from("backup_jobs").update({
          progress: { ...(failed.progress || {}), failed_prefix_cleanup: "completed" },
          updated_at: new Date().toISOString(),
        }).eq("id", failed.id).eq("status", "failed");
        if (progressError) throw new Error(`Failed prefix removed, but cleanup progress could not be recorded: ${progressError.message}`);

        failedResults.push({
          id: failed.id, files_deleted: deleted.length, verified_empty: true,
          audit_logged: !priorLog, deleted: true,
        });
      } catch (error) {
        failedResults.push({
          id: failed.id, deleted: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const verifiedCount = completedResults.filter((item) => item.verified === true).length;
    const deletedCount = completedResults.filter((item) => item.deleted === true).length;
    const failedDeletedCount = failedResults.filter((item) => item.deleted === true).length;
    return jsonResponse({
      success: true,
      dry_run: dryRun,
      limit: jobLimit,
      completed_jobs_total: (jobs || []).length,
      completed_jobs_eligible: eligible.length,
      completed_jobs_processed: jobsToProcess.length,
      completed_jobs_remaining: Math.max(0, eligible.length - jobsToProcess.length),
      skipped_completed_jobs: skipped.length,
      verified_count: verifiedCount,
      cleaned_count: deletedCount,
      bytes_freed: bytesFreed,
      completed_results: completedResults,
      failed_jobs_checked: (failedJobs || []).length,
      failed_jobs_cleaned: failedDeletedCount,
      failed_results: failedResults,
    });
  } catch (error) {
    console.error("crm-backup-zip-cleanup failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
