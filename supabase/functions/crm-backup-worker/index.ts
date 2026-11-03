import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "https://deno.land/x/zipjs@v2.7.45/index.js";
import JSZip from "https://esm.sh/jszip@3.10.1";

import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";
import { BACKUP_EXCLUDED_TABLES, RESTORE_INSERT_ORDER, dedupeTables } from "../_shared/crmBackupConfig.ts";
import { fetchAllRows, discoverAllTables, toCsv } from "../_shared/backupHelpers.ts";

function sha256Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

async function listTableObjects(admin: any, prefix: string): Promise<string[]> {
  const folder = `${prefix.replace(/\/$/, "")}/tables`;
  const storage = admin.storage.from("crm-backups");
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await storage.list(folder, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Storage list failed for ${folder}: ${error.message}`);
    const entries = data || [];
    for (const entry of entries) {
      if (entry.id && /\.(json|csv)$/i.test(entry.name)) paths.push(`${folder}/${entry.name}`);
    }
    if (entries.length < pageSize) break;
    offset += pageSize;
  }
  return paths;
}

async function deleteIntermediateTableFiles(admin: any, prefix: string): Promise<{ deleted: number; remaining: number }> {
  const storage = admin.storage.from("crm-backups");
  const paths = await listTableObjects(admin, prefix);
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000);
    const { error } = await storage.remove(batch);
    if (error) throw new Error(`Storage remove failed for intermediate backup files: ${error.message}`);
  }
  const remainingPaths = await listTableObjects(admin, prefix);
  if (remainingPaths.length > 0) {
    throw new Error(`Intermediate file cleanup incomplete: ${remainingPaths.length} JSON/CSV objects remain.`);
  }
  return { deleted: paths.length, remaining: remainingPaths.length };
}

async function runZipFinalization(
  admin: any,
  job: any,
  prefix: string,
  tables: string[],
  manifest: Record<string, unknown>,
): Promise<{ checksumSha256: string; totalSizeBytes: number; rawFilesDeleted: number }> {
  const storage = admin.storage.from("crm-backups");
  const filePaths = ["manifest.json"];
  for (const table of tables) filePaths.push(`tables/${table}.json`, `tables/${table}.csv`);

  const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
  for (const relativePath of filePaths) {
    const { data: blob, error } = await storage.download(`${prefix}${relativePath}`);
    if (error || !blob) {
      throw new Error(`Cannot finalize ZIP: required source file ${relativePath} is missing (${error?.message || "no blob"}).`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (relativePath.endsWith(".json")) {
      try {
        JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new Error(`Cannot finalize ZIP: ${relativePath} contains invalid JSON.`);
      }
    }
    await zipWriter.add(relativePath, new Uint8ArrayReader(bytes));
  }

  const zipBlob = await zipWriter.close();
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
  const checksumSha256 = await sha256Hex(zipBytes);
  const zipPath = `${prefix}backup.zip`;

  const { error: uploadError } = await storage.upload(zipPath, zipBlob, {
    contentType: "application/zip",
    upsert: true,
  });
  if (uploadError) throw new Error(`Could not upload backup.zip: ${uploadError.message}`);

  // Verify the persisted object, not just the in-memory ZIP.
  const { data: storedZip, error: downloadError } = await storage.download(zipPath);
  if (downloadError || !storedZip) throw new Error(`Uploaded backup.zip cannot be downloaded: ${downloadError?.message || "missing"}`);
  const storedBytes = new Uint8Array(await storedZip.arrayBuffer());
  const storedChecksum = await sha256Hex(storedBytes);
  if (storedBytes.byteLength !== zipBytes.byteLength || storedChecksum !== checksumSha256) {
    throw new Error("Persisted backup.zip size or SHA-256 does not match the uploaded archive.");
  }

  const verifiedZip = await JSZip.loadAsync(storedZip, { checkCRC32: true });
  const storedManifestEntry = verifiedZip.file("manifest.json");
  if (!storedManifestEntry) throw new Error("Persisted backup.zip has no manifest.json.");
  let parsedManifest: any;
  try {
    parsedManifest = JSON.parse(await storedManifestEntry.async("string"));
  } catch {
    throw new Error("Persisted backup.zip has an invalid manifest.json.");
  }
  if (parsedManifest.integrity_status !== "valid" ||
      parsedManifest.tableCount !== tables.length ||
      !Array.isArray(parsedManifest.tables) ||
      parsedManifest.tables.length !== tables.length ||
      parsedManifest.tables.some((table: string, index: number) => table !== tables[index])) {
    throw new Error("Persisted ZIP manifest does not match the expected export table set.");
  }

  const actualFiles = Object.values(verifiedZip.files).filter((entry: any) => !entry.dir);
  const expectedFileCount = 1 + tables.length * 2;
  if (actualFiles.length !== expectedFileCount) {
    throw new Error(`ZIP contains ${actualFiles.length} files; expected exactly ${expectedFileCount}.`);
  }
  for (const table of tables) {
    const jsonEntry = verifiedZip.file(`tables/${table}.json`);
    const csvEntry = verifiedZip.file(`tables/${table}.csv`);
    if (!jsonEntry || !csvEntry) throw new Error(`ZIP is missing table files for ${table}.`);
    let rows: unknown;
    try {
      rows = JSON.parse(await jsonEntry.async("string"));
    } catch {
      throw new Error(`ZIP table JSON is invalid for ${table}.`);
    }
    if (!Array.isArray(rows)) throw new Error(`ZIP table JSON is not an array for ${table}.`);
  }

  // The raw exports are redundant only after the stored ZIP and its full contents pass verification.
  // A cleanup failure does not invalidate the verified archive; it leaves the job restorable
  // and exposes raw_files_cleanup="pending" for a later cleanup retry.
  let cleanup = { deleted: 0, remaining: 0 };
  let cleanupWarning: string | null = null;
  try {
    cleanup = await deleteIntermediateTableFiles(admin, prefix);
  } catch (error) {
    cleanupWarning = error instanceof Error ? error.message : String(error);
    console.error("Verified ZIP retained, but raw table cleanup is pending:", cleanupWarning);
    try {
      const remaining = await listTableObjects(admin, prefix);
      cleanup = { deleted: 0, remaining: remaining.length };
    } catch (listError) {
      cleanupWarning += " | re-list failed: " + (listError instanceof Error ? listError.message : String(listError));
      cleanup = { deleted: 0, remaining: -1 };
    }
  }

  const now = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - new Date(job.created_at).getTime());
  const { error: updateError } = await admin.from("backup_jobs").update({
    status: "completed",
    completed_at: now,
    zip_path: zipPath,
    checksum_sha256: checksumSha256,
    total_size_bytes: zipBytes.byteLength,
    duration_ms: durationMs,
    table_count: tables.length,
    integrity_status: "valid",
    error_message: null,
    progress: {
      ...(job.progress || {}),
      tables_done: tables.length,
      tables_total: tables.length,
      current_table: null,
      raw_files_cleanup: cleanup.remaining === 0 ? "completed" : "pending",
      raw_files_cleanup_warning: cleanupWarning,
    },
    updated_at: now,
  }).eq("id", job.id);
  if (updateError) throw new Error(`Backup verified, but job completion update failed: ${updateError.message}`);

  return { checksumSha256, totalSizeBytes: zipBytes.byteLength, rawFilesDeleted: cleanup.deleted };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  const cronAuthorized = Boolean(cronHeader && expectedCronSecret && cronHeader === expectedCronSecret);
  if (!cronAuthorized) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return jsonResponse({ error: "Unauthorized" }, { status: auth.status });
  }

  const admin = createAdminClient();
  const body = await readJson<{ job_id?: string }>(req);
  let jobId = body.job_id;
  if (!jobId) {
    const { data, error } = await admin.from("backup_jobs").select("id")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    if (!data) return jsonResponse({ message: "No pending jobs" });
    jobId = data.id;
  }

  const { data: existing, error: existingError } = await admin.from("backup_jobs").select("*")
    .eq("id", jobId).in("status", ["pending", "processing"]).maybeSingle();
  if (existingError) return jsonResponse({ error: existingError.message }, { status: 500 });
  if (!existing) return jsonResponse({ message: "Job not claimable (finished or missing)" });

  const claimPatch: Record<string, any> = { status: "processing", updated_at: new Date().toISOString() };
  if (!existing.started_at) claimPatch.started_at = new Date().toISOString();
  const { data: job, error: claimError } = await admin.from("backup_jobs")
    .update(claimPatch).eq("id", jobId).select().single();
  if (claimError || !job) return jsonResponse({ error: claimError?.message || "Backup job claim failed." }, { status: 500 });

  try {
    let tablesToExport = job.tables_to_export as string[] | null;
    if (!tablesToExport) {
      const discovered = await discoverAllTables(admin);
      const configured = dedupeTables(job.include_modules);
      const merged = discovered.length > 0 ? new Set([...discovered, ...configured]) : new Set(configured);
      tablesToExport = [...merged].filter((table) => !BACKUP_EXCLUDED_TABLES.has(table));
      const { error } = await admin.from("backup_jobs").update({
        tables_to_export: tablesToExport,
        storage_prefix: `backups/${job.id}/`,
        progress: { tables_done: 0, tables_total: tablesToExport.length, current_table: null },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (error) throw new Error(`Could not initialize backup job: ${error.message}`);
    }

    const prefix = job.storage_prefix || `backups/${job.id}/`;
    const completed = job.tables_completed || [];
    const nextTable = tablesToExport.find((table) => !completed.includes(table));

    if (!nextTable) {
      const exported = new Set(tablesToExport);
      const ordered = RESTORE_INSERT_ORDER.filter((table) => exported.has(table));
      const restoreOrder = [...ordered, ...tablesToExport.filter((table) => !ordered.includes(table))];
      const manifest = {
        version: "2.1.0-zip-only",
        completedAt: new Date().toISOString(),
        tables: tablesToExport,
        tableCount: tablesToExport.length,
        restoreOrder,
        includeFiles: job.include_files,
        integrity_status: "valid",
      };

      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      const { error: manifestError } = await admin.storage.from("crm-backups").upload(
        `${prefix}manifest.json`, manifestBytes,
        { contentType: "application/json", upsert: true },
      );
      if (manifestError) throw new Error(`Could not upload manifest.json: ${manifestError.message}`);

      const { data: verifyManifest, error: manifestReadError } = await admin.storage.from("crm-backups")
        .download(`${prefix}manifest.json`);
      if (manifestReadError || !verifyManifest) throw new Error("Uploaded manifest.json cannot be downloaded.");
      const persistedManifest = JSON.parse(await verifyManifest.text());
      if (persistedManifest.integrity_status !== "valid" ||
          persistedManifest.tableCount !== tablesToExport.length ||
          JSON.stringify(persistedManifest.tables) !== JSON.stringify(tablesToExport)) {
        throw new Error("Persisted manifest does not match the expected export.");
      }

      const finalized = await runZipFinalization(admin, job, prefix, tablesToExport, persistedManifest);
      return jsonResponse({
        status: "completed",
        integrity_status: "valid",
        checksum_sha256: finalized.checksumSha256,
        total_size_bytes: finalized.totalSizeBytes,
        raw_files_deleted: finalized.rawFilesDeleted,
      });
    }

    // Export a single table; each upload and the completion RPC must succeed before chaining.
    const rows = await fetchAllRows(admin, nextTable);
    const storage = admin.storage.from("crm-backups");
    const { error: jsonUploadError } = await storage.upload(
      `${prefix}tables/${nextTable}.json`,
      new TextEncoder().encode(JSON.stringify(rows, null, 2)),
      { contentType: "application/json", upsert: true },
    );
    if (jsonUploadError) throw new Error(`JSON export upload failed for ${nextTable}: ${jsonUploadError.message}`);
    const { error: csvUploadError } = await storage.upload(
      `${prefix}tables/${nextTable}.csv`,
      new TextEncoder().encode(toCsv(rows)),
      { contentType: "text/csv", upsert: true },
    );
    if (csvUploadError) throw new Error(`CSV export upload failed for ${nextTable}: ${csvUploadError.message}`);

    const { data: doneCount, error: completionError } = await admin.rpc("claim_backup_table", {
      p_job_id: job.id,
      p_table_name: nextTable,
    });
    if (completionError) throw new Error(`claim_backup_table failed: ${completionError.message}`);

    // Always enqueue a final pass, including after the last table, so ZIP finalization cannot be skipped.
    const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-backup-worker`;
    const selfCall = fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-cron-secret": Deno.env.get("CRON_SECRET") || "",
      },
      body: JSON.stringify({ job_id: job.id }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Worker self-chain returned HTTP ${response.status}`);
    }).catch((error) => console.error("Backup worker self-chain failed; scheduled workflow can nudge the job:", error));
    // @ts-ignore Supabase EdgeRuntime is provided by the hosted Deno runtime.
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(selfCall);

    return jsonResponse({ status: "processing", table: nextTable, done: doneCount, total: tablesToExport.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { error: failedUpdateError } = await admin.from("backup_jobs").update({
      status: "failed",
      integrity_status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (failedUpdateError) console.error("Could not record failed backup state:", failedUpdateError);
    return jsonResponse({ status: "failed", error: message }, { status: 500 });
  }
});
