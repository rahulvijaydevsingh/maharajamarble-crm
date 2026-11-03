import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

function sha256Hex(data: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", data).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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

  const externalManifest = JSON.parse(await manifestBlob.text());
  const zip = await JSZip.loadAsync(zipBlob, { checkCRC32: true });
  const internalManifestEntry = zip.file("manifest.json");
  if (!internalManifestEntry) throw new Error("ZIP is missing its own manifest.json.");
  const internalManifest = JSON.parse(await internalManifestEntry.async("string"));

  const expectedTables = Array.isArray(job.tables_to_export) ? job.tables_to_export : [];
  const completedTables = Array.isArray(job.tables_completed) ? job.tables_completed : [];
  const manifestTables = Array.isArray(externalManifest.tables) ? externalManifest.tables : [];
  if (expectedTables.length === 0 ||
      !sameList(manifestTables, expectedTables) ||
      !sameList(internalManifest.tables || [], expectedTables) ||
      Number(externalManifest.tableCount) !== expectedTables.length ||
      Number(internalManifest.tableCount) !== expectedTables.length ||
      expectedTables.some((table) => !completedTables.includes(table))) {
    throw new Error("Manifest or backup_jobs table list is incomplete or inconsistent.");
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
    const rows = JSON.parse(await jsonEntry.async("string"));
    if (!Array.isArray(rows)) throw new Error(`ZIP JSON for ${table} is not an array.`);
  }
  return { zipPath, manifestPath, prefix, checksum, size: zipBytes.byteLength };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createAdminClient();

  const cronHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  let authorized = Boolean(cronHeader && expectedCronSecret && cronHeader === expectedCronSecret);
  if (!authorized) authorized = (await requireAdmin(req)).ok;
  if (!authorized) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson<{ dry_run?: boolean }>(req);
  const dryRun = body.dry_run !== false;

  try {
    const { data: jobs, error: jobsError } = await admin.from("backup_jobs")
      .select("id,status,created_at,storage_prefix,zip_path,manifest_path,checksum_sha256,total_size_bytes,tables_to_export,tables_completed,progress")
      .eq("status", "completed").order("created_at", { ascending: true });
    if (jobsError) throw new Error(`Could not read completed backups: ${jobsError.message}`);

    const results: Array<Record<string, unknown>> = [];
    let bytesFreed = 0;
    for (const job of jobs || []) {
      try {
        const verified = await verifyBackup(admin, job);
        const rawFiles = await listTableObjects(admin, verified.prefix);
        const rawBytes = rawFiles.reduce((sum, file) => sum + file.size, 0);
        if (!dryRun) {
          const { error: validError } = await admin.from("backup_jobs").update({
            integrity_status: "valid",
            checksum_sha256: verified.checksum,
            total_size_bytes: verified.size,
            zip_path: verified.zipPath,
            manifest_path: verified.manifestPath,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("status", "completed");
          if (validError) throw new Error(`Verified archive but could not persist its integrity state: ${validError.message}`);

          for (let i = 0; i < rawFiles.length; i += 1000) {
            const batch = rawFiles.slice(i, i + 1000).map((file) => file.path);
            const { error: removeError } = await admin.storage.from("crm-backups").remove(batch);
            if (removeError) throw new Error(`Storage remove failed: ${removeError.message}`);
          }
          const remaining = await listTableObjects(admin, verified.prefix);
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

        results.push({
          id: job.id, verified: true, zip_path: verified.zipPath,
          checksum_sha256: verified.checksum, zip_bytes: verified.size,
          raw_table_files: rawFiles.length, raw_table_bytes: rawBytes,
          deleted: !dryRun,
        });
      } catch (error) {
        results.push({ id: job.id, verified: false, deleted: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const verifiedCount = results.filter((item) => item.verified === true).length;
    const deletedCount = results.filter((item) => item.deleted === true).length;
    return jsonResponse({
      success: true, dry_run: dryRun, completed_jobs: (jobs || []).length,
      verified_count: verifiedCount, cleaned_count: deletedCount, bytes_freed: bytesFreed, results,
    });
  } catch (error) {
    console.error("crm-backup-zip-cleanup failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
