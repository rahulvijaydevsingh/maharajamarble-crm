import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "https://deno.land/x/zipjs@v2.7.45/index.js";

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

async function verifyStoredZipMatches(zipPath: string, expectedBytes: Uint8Array): Promise<void> {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials for ZIP verification.");
  const encodedPath = zipPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${baseUrl}/storage/v1/object/authenticated/crm-backups/${encodedPath}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Persisted backup.zip cannot be streamed for verification (HTTP ${response.status}).`);
  }

  const reader = response.body.getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > expectedBytes.length) {
      await reader.cancel();
      throw new Error("Persisted backup.zip is larger than the generated archive.");
    }
    for (let index = 0; index < value.length; index++) {
      if (value[index] !== expectedBytes[offset + index]) {
        await reader.cancel();
        throw new Error(`Persisted backup.zip differs from the generated archive at byte ${offset + index}.`);
      }
    }
    offset += value.length;
  }
  if (offset !== expectedBytes.length) {
    throw new Error(`Persisted backup.zip size mismatch (expected ${expectedBytes.length}, received ${offset}).`);
  }
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

  const zipWriter = new ZipWriter(new BlobWriter("application/zip"), { level: 1 });
  for (const relativePath of filePaths) {
    const { data: blob, error } = await storage.download(`${prefix}${relativePath}`);
    if (error || !blob) {
      throw new Error(`Cannot finalize ZIP: required source file ${relativePath} is missing (${error?.message || "no blob"}).`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error(`Cannot finalize ZIP: required source file ${relativePath} is empty.`);
    }
    await zipWriter.add(relativePath, new Uint8ArrayReader(bytes));
  }

  // Hash the completed ZIP buffer, then release the Blob before upload so only one
  // full-size archive representation remains live during the network transfer.
  let zipBlob: Blob | null = await zipWriter.close();
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
  zipBlob = null;
  const totalSizeBytes = zipBytes.byteLength;
  const checksumSha256 = await sha256Hex(zipBytes);
  const zipPath = `${prefix}backup.zip`;

  const { error: uploadError } = await storage.upload(zipPath, zipBytes, {
    contentType: "application/zip",
    upsert: true,
  });
  if (uploadError) throw new Error(`Could not upload backup.zip: ${uploadError.message}`);
  await verifyStoredZipMatches(zipPath, zipBytes);

  // Verify Storage metadata without downloading a second full copy or inflating
  // all ZIP members inside the Edge Runtime.
  const { data: storedObjects, error: listZipError } = await storage.list(
    prefix.replace(/\/$/, ""),
    { limit: 100, sortBy: { column: "name", order: "asc" } },
  );
  if (listZipError) throw new Error(`Could not verify stored backup.zip metadata: ${listZipError.message}`);
  const storedZip = (storedObjects || []).find((entry: any) => entry.name === "backup.zip");
  const storedSize = Number(storedZip?.metadata?.size ?? -1);
  if (!storedZip || storedSize !== totalSizeBytes) {
    throw new Error(`Persisted backup.zip size mismatch (expected ${totalSizeBytes}, found ${storedSize}).`);
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
    total_size_bytes: totalSizeBytes,
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

  return { checksumSha256, totalSizeBytes, rawFilesDeleted: cleanup.deleted };
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
  const body = await readJson<{ job_id?: string; phase?: "export" | "finalize" }>(req);
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
    if (body.phase === "finalize" && completed.length !== tablesToExport.length) {
      throw new Error(`Finalization was requested before all tables completed (${completed.length}/${tablesToExport.length}).`);
    }
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
    const csvContent = toCsv(rows);
    // Keep CSV members non-empty for empty tables; JSON [] remains authoritative.
    const csvBytes = new TextEncoder().encode(csvContent.length > 0 ? csvContent : "\n");
    const { error: csvUploadError } = await storage.upload(
      `${prefix}tables/${nextTable}.csv`,
      csvBytes,
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
    const allTablesExported = Number(doneCount) >= tablesToExport.length;
    const nextPhase = allTablesExported ? "finalize" : "export";
    const selfCall = fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-cron-secret": Deno.env.get("CRON_SECRET") || "",
      },
      body: JSON.stringify({ job_id: job.id, phase: nextPhase }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Worker self-chain returned HTTP ${response.status}`);
    }).catch((error) => console.error("Backup worker self-chain failed; scheduled workflow can nudge the job:", error));
    // @ts-ignore Supabase EdgeRuntime is provided by the hosted Deno runtime.
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(selfCall);

    return jsonResponse({ status: "processing", table: nextTable, done: doneCount, total: tablesToExport.length, next_phase: nextPhase });
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
