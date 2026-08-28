import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "https://deno.land/x/zipjs@v2.7.45/index.js";

import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/authz.ts";
import {
  BACKUP_EXCLUDED_TABLES,
  RESTORE_INSERT_ORDER,
  dedupeTables,
} from "../_shared/crmBackupConfig.ts";
import { fetchAllRows, discoverAllTables, toCsv } from "../_shared/backupHelpers.ts";

async function runZipFinalization(
  admin: any,
  jobId: string,
  prefix: string,
  tables: string[],
  manifest: any,
  jobCreatedAt?: string,
) {
  try {
    const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
    const filePaths = ["manifest.json"];
    let filesDownloadedCount = 0;

    for (const t of tables) {
      filePaths.push(`tables/${t}.json`, `tables/${t}.csv`);
    }

    for (const rel of filePaths) {
      const { data: blob, error } = await admin.storage.from("crm-backups").download(`${prefix}${rel}`);
      if (error || !blob) continue;
      filesDownloadedCount++;
      const buf = new Uint8Array(await blob.arrayBuffer());
      await zipWriter.add(rel, new Uint8ArrayReader(buf));
    }

    const zipBlob = await zipWriter.close();
    const zipBuffer = new Uint8Array(await zipBlob.arrayBuffer());

    // Compute SHA-256 checksum (hex encoded)
    const hashBuffer = await crypto.subtle.digest("SHA-256", zipBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksumSha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const totalSizeBytes = zipBuffer.byteLength;
    const nowMs = Date.now();
    const createdAtMs = jobCreatedAt ? new Date(jobCreatedAt).getTime() : nowMs;
    const durationMs = Math.max(0, nowMs - createdAtMs);
    const tableCount = tables.length;

    // Integrity check logic:
    // Integrity status is 'valid' if manifest's table count matches tables.length
    // and all table files/manifest were successfully downloaded (or non-empty structure).
    const manifestValid = manifest && manifest.tableCount === tableCount && Array.isArray(manifest.tables) && manifest.tables.length === tableCount;
    // Expected file downloads: 1 manifest + 2 files per table (json + csv)
    const expectedFileCount = 1 + (tableCount * 2);
    const integrityStatus = manifestValid && (filesDownloadedCount === expectedFileCount) ? "valid" : "failed";

    await admin.storage.from("crm-backups").upload(
      `${prefix}backup.zip`,
      zipBlob,
      { contentType: "application/zip", upsert: true },
    );

    const nowIso = new Date().toISOString();
    await admin.from("backup_jobs").update({
      status: "completed",
      completed_at: nowIso,
      zip_path: `${prefix}backup.zip`,
      checksum_sha256: checksumSha256,
      total_size_bytes: totalSizeBytes,
      duration_ms: durationMs,
      table_count: tableCount,
      integrity_status: integrityStatus,
      updated_at: nowIso,
    }).eq("id", jobId);
  } catch (e) {
    console.error("zip finalization failed:", e);
    const nowIso = new Date().toISOString();
    await admin.from("backup_jobs").update({
      status: "completed",
      completed_at: nowIso,
      integrity_status: "failed",
      updated_at: nowIso,
    }).eq("id", jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createAdminClient();
  const body = await readJson<{ job_id?: string }>(req);

  let jobId = body.job_id;
  if (!jobId) {
    const { data } = await admin.from("backup_jobs").select("id")
      .eq("status", "pending").order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (!data) return jsonResponse({ message: "No pending jobs" });
    jobId = data.id;
  }

  const { data: existing } = await admin.from("backup_jobs").select("*")
    .eq("id", jobId).in("status", ["pending", "processing"]).maybeSingle();
  if (!existing) return jsonResponse({ message: "Job not claimable (finished or missing)" });

  const claimPatch: Record<string, any> = {
    status: "processing",
    updated_at: new Date().toISOString(),
  };
  if (!existing.started_at) claimPatch.started_at = new Date().toISOString();

  const { data: job, error: claimErr } = await admin.from("backup_jobs")
    .update(claimPatch).eq("id", jobId).select().single();
  if (claimErr || !job) return jsonResponse({ error: claimErr?.message || "claim failed" }, { status: 500 });

  try {
    let tablesToExport = job.tables_to_export as string[] | null;
    if (!tablesToExport) {
      const discovered = await discoverAllTables(admin);
      const fromConfig = dedupeTables(job.include_modules);
      const merged = discovered.length > 0
        ? new Set([...discovered, ...fromConfig])
        : new Set(fromConfig);
      tablesToExport = [...merged].filter((t) => !BACKUP_EXCLUDED_TABLES.has(t));

      await admin.from("backup_jobs").update({
        tables_to_export: tablesToExport,
        storage_prefix: `backups/${job.id}/`,
        progress: {
          tables_done: 0,
          tables_total: tablesToExport.length,
          current_table: null,
        },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }

    const completed: string[] = job.tables_completed || [];
    const nextTable = tablesToExport.find((t) => !completed.includes(t));
    const prefix = job.storage_prefix || `backups/${job.id}/`;

    if (!nextTable) {
      const exportedSet = new Set(tablesToExport);
      const ordered = RESTORE_INSERT_ORDER.filter((t) => exportedSet.has(t));
      const remaining = tablesToExport.filter((t) => !ordered.includes(t));
      const restoreOrder = [...ordered, ...remaining];

      const manifest = {
        version: "2.0.0-async",
        completedAt: new Date().toISOString(),
        tables: tablesToExport,
        tableCount: tablesToExport.length,
        restoreOrder,
        includeFiles: job.include_files,
      };
      await admin.storage.from("crm-backups").upload(
        `${prefix}manifest.json`,
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        { contentType: "application/json", upsert: true },
      );

      await admin.from("backup_jobs").update({
        manifest_path: `${prefix}manifest.json`,
        progress: {
          ...(job.progress || {}),
          tables_done: tablesToExport.length,
          current_table: null,
        },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      await runZipFinalization(admin, job.id, prefix, tablesToExport, manifest, job.created_at);
      return jsonResponse({ status: "completed" });
    }

    // Process exactly ONE table
    const rows = await fetchAllRows(admin, nextTable);

    await admin.storage.from("crm-backups").upload(
      `${prefix}tables/${nextTable}.json`,
      new TextEncoder().encode(JSON.stringify(rows, null, 2)),
      { contentType: "application/json", upsert: true },
    );
    await admin.storage.from("crm-backups").upload(
      `${prefix}tables/${nextTable}.csv`,
      new TextEncoder().encode(toCsv(rows)),
      { contentType: "text/csv", upsert: true },
    );

    const newCompleted = [...completed, nextTable];
    await admin.from("backup_jobs").update({
      tables_completed: newCompleted,
      progress: {
        tables_done: newCompleted.length,
        tables_total: tablesToExport.length,
        current_table: nextTable,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    if (newCompleted.length < tablesToExport.length) {
      const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-backup-worker`;
      const selfCall = fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ job_id: job.id }),
      }).catch((e) => console.error("self-chain failed:", e));
      // @ts-ignore - EdgeRuntime is available in Supabase's Deno runtime
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(selfCall);
    }

    return jsonResponse({
      status: "processing",
      table: nextTable,
      done: newCompleted.length,
      total: tablesToExport.length,
    });
  } catch (e) {
    await admin.from("backup_jobs").update({
      status: "failed",
      error_message: e instanceof Error ? e.message : String(e),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return jsonResponse({
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
