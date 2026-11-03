import JSZip from "jszip";
import { createHash } from "node:crypto";

const projectId = process.env.PROJECT_ID;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const dryRun = process.env.DRY_RUN === "true";
const jobLimit = Math.min(20, Math.max(1, Number.parseInt(process.env.JOB_LIMIT || "5", 10)));

if (!projectId || !serviceRoleKey || !cronSecret) {
  throw new Error("PROJECT_ID, SERVICE_ROLE_KEY and CRON_SECRET are required.");
}

const baseUrl = "https://" + projectId + ".supabase.co";
const authHeaders = {
  apikey: serviceRoleKey,
  Authorization: "Bearer " + serviceRoleKey,
};

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error("HTTP " + response.status + " for " + url + ": " + body.slice(0, 1000));
  }
  return response;
}

async function restRows(table, query) {
  const url = baseUrl + "/rest/v1/" + table + "?" + query;
  return await (await fetchChecked(url, { headers: authHeaders })).json();
}

async function listStorageFiles(folder) {
  const paths = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const response = await fetchChecked(baseUrl + "/storage/v1/object/list/crm-backups", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix: folder.replace(/^\/+|\/+$/g, ""),
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    const entries = await response.json();
    for (const entry of entries || []) {
      const path = folder.replace(/\/+$/g, "") + "/" + entry.name;
      if (entry.id) {
        paths.push({ path, size: Number(entry.metadata && entry.metadata.size || 0) });
      } else {
        paths.push(...await listStorageFiles(path));
      }
    }
    if (!entries || entries.length < pageSize) break;
    offset += pageSize;
  }
  return paths;
}

async function downloadObject(path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetchChecked(baseUrl + "/storage/v1/object/crm-backups/" + encodedPath, {
    headers: authHeaders,
  });
  return Buffer.from(await response.arrayBuffer());
}

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, index) => value === b[index]);
}

function entrySize(entry) {
  const size = entry && entry._data && entry._data.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

async function verifyJob(job) {
  const prefix = job.storage_prefix || ("backups/" + job.id + "/");
  const normalizedPrefix = prefix.replace(/\/?$/, "/");
  const zipPath = job.zip_path || normalizedPrefix + "backup.zip";
  const manifestPath = job.manifest_path || normalizedPrefix + "manifest.json";
  if (!zipPath.startsWith("backups/" + job.id + "/") ||
      !normalizedPrefix.startsWith("backups/" + job.id + "/")) {
    throw new Error("Storage prefix/ZIP path does not match the backup job ID.");
  }

  const [zipBytes, externalManifestBytes] = await Promise.all([
    downloadObject(zipPath),
    downloadObject(manifestPath),
  ]);
  const checksum = createHash("sha256").update(zipBytes).digest("hex");
  if (job.checksum_sha256 && String(job.checksum_sha256).toLowerCase() !== checksum) {
    throw new Error("Stored SHA-256 does not match backup.zip.");
  }
  if (job.total_size_bytes != null && Number(job.total_size_bytes) !== zipBytes.byteLength) {
    throw new Error("Stored ZIP byte size does not match backup_jobs.total_size_bytes.");
  }

  let externalManifest;
  try {
    externalManifest = JSON.parse(externalManifestBytes.toString("utf8"));
  } catch {
    throw new Error("External manifest.json is not valid JSON.");
  }

  // This is the full CRC32 validation, executed on the GitHub runner rather
  // than inside the Edge Function's constrained worker.
  const zip = await JSZip.loadAsync(zipBytes, { checkCRC32: true });
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("ZIP is missing manifest.json.");
  const internalManifest = JSON.parse(await manifestEntry.async("string"));

  const expectedTables = Array.isArray(job.tables_to_export) ? job.tables_to_export : [];
  const completedTables = Array.isArray(job.tables_completed) ? job.tables_completed : [];
  const externalTables = Array.isArray(externalManifest.tables) ? externalManifest.tables : [];
  const internalTables = Array.isArray(internalManifest.tables) ? internalManifest.tables : [];
  if (expectedTables.length === 0 ||
      !sameList(externalTables, expectedTables) ||
      !sameList(internalTables, expectedTables) ||
      !sameList(externalTables, internalTables) ||
      Number(externalManifest.tableCount) !== expectedTables.length ||
      Number(internalManifest.tableCount) !== expectedTables.length ||
      expectedTables.some((table) => !completedTables.includes(table))) {
    throw new Error("Manifest table list/count does not match backup_jobs.");
  }

  const zipFiles = Object.values(zip.files).filter((entry) => !entry.dir);
  if (zipFiles.length !== 1 + expectedTables.length * 2) {
    throw new Error("ZIP contains an unexpected number of files.");
  }
  for (const table of expectedTables) {
    const jsonEntry = zip.file("tables/" + table + ".json");
    const csvEntry = zip.file("tables/" + table + ".csv");
    if (!jsonEntry || !csvEntry) throw new Error("ZIP is missing JSON/CSV member(s) for " + table + ".");
    const jsonSize = entrySize(jsonEntry);
    const csvSize = entrySize(csvEntry);
    if (jsonSize === null || jsonSize <= 0) {
      throw new Error("Table JSON has no non-zero uncompressed size: " + table);
    }
    if (csvSize === null || (csvSize <= 0 && jsonSize !== 2)) {
      throw new Error("Table CSV has an invalid uncompressed size: " + table);
    }
    if (csvSize === 0 && jsonSize === 2) {
      const emptyJson = (await jsonEntry.async("string")).trim();
      if (emptyJson !== "[]") throw new Error("Zero-byte CSV is only accepted for JSON []: " + table);
    }
  }
  return {
    id: job.id,
    verified: true,
    zip_path: zipPath,
    checksum_sha256: checksum,
    zip_bytes: zipBytes.byteLength,
    table_count: expectedTables.length,
  };
}

async function invokeCleanup(verifiedIds) {
  const response = await fetchChecked(baseUrl + "/functions/v1/crm-backup-zip-cleanup", {
    method: "POST",
    headers: {
      ...authHeaders,
      "x-cron-secret": cronSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dry_run: false,
      limit: verifiedIds.length,
      crc32_verified_job_ids: verifiedIds,
    }),
  });
  const result = await response.json();
  if (!result.success || result.error) {
    throw new Error("Edge cleanup failed: " + JSON.stringify(result));
  }
  const notDeleted = (result.completed_results || []).filter((item) => item.verified !== true || item.deleted !== true);
  if (notDeleted.length > 0) {
    throw new Error("Edge cleanup did not delete every externally verified job: " + JSON.stringify(notDeleted));
  }
  return result;
}

const jobSelect = [
  "id", "status", "created_at", "storage_prefix", "zip_path", "manifest_path",
  "checksum_sha256", "total_size_bytes", "tables_to_export", "tables_completed", "progress",
].join(",");
const jobs = await restRows(
  "backup_jobs",
  "select=" + encodeURIComponent(jobSelect) + "&status=eq.completed&order=created_at.asc&limit=1000"
);

const candidates = [];
const skipped = [];
for (const job of jobs || []) {
  const prefix = job.storage_prefix || ("backups/" + job.id + "/");
  const raw = (await listStorageFiles(prefix.replace(/\/+$/g, "") + "/tables"))
    .filter((file) => /\.(json|csv)$/i.test(file.path));
  if (raw.length > 0 || !job.progress || job.progress.raw_files_cleanup !== "completed") {
    candidates.push({ job, raw });
  } else {
    skipped.push({ id: job.id, reason: "ZIP-only; no raw table files remain" });
  }
}

const failedJobs = await restRows(
  "backup_jobs",
  "select=id,created_at,storage_prefix,status&status=eq.failed&order=created_at.asc&limit=1000"
);
const failedPrefixes = [];
for (const failed of failedJobs || []) {
  const prefix = failed.storage_prefix || ("backups/" + failed.id + "/");
  const files = await listStorageFiles(prefix);
  if (files.length > 0) {
    failedPrefixes.push({
      id: failed.id,
      files: files.length,
      bytes: files.reduce((sum, item) => sum + item.size, 0),
      explicitly_includes_september_01_job: failed.id === "649ea45a-917e-4c4b-85d7-19d88366e05a",
    });
  }
}

console.log(JSON.stringify({
  phase: dryRun ? "dry_run" : "execute",
  project_id: projectId,
  completed_jobs_total: (jobs || []).length,
  candidates: candidates.length,
  failed_prefix_candidates: failedPrefixes,
  skipped_zip_only: skipped.length,
}, null, 2));

const results = [];
for (let index = 0; index < candidates.length; index += jobLimit) {
  const batch = candidates.slice(index, index + jobLimit);
  const verifiedIds = [];
  for (const candidate of batch) {
    try {
      const verified = await verifyJob(candidate.job);
      verifiedIds.push(candidate.job.id);
      results.push({
        ...verified,
        raw_table_files: candidate.raw.length,
        raw_table_bytes: candidate.raw.reduce((sum, file) => sum + file.size, 0),
        deleted: false,
      });
    } catch (error) {
      results.push({
        id: candidate.job.id,
        verified: false,
        deleted: false,
        raw_table_files: candidate.raw.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("Verified batch " + (Math.floor(index / jobLimit) + 1) + ": " +
    verifiedIds.length + "/" + batch.length + " ZIP(s) passed CRC/SHA/manifest checks.");

  if (verifiedIds.length !== batch.length) {
    console.log(JSON.stringify(results, null, 2));
    throw new Error("At least one completed backup failed verification. No deletions were started.");
  }

  if (!dryRun) {
    const cleanup = await invokeCleanup(verifiedIds);
    for (const result of results) {
      if (verifiedIds.includes(result.id)) result.deleted = true;
    }
    console.log(JSON.stringify({
      cleanup_batch: Math.floor(index / jobLimit) + 1,
      cleaned_count: cleanup.cleaned_count,
      bytes_freed: cleanup.bytes_freed,
      failed_jobs_cleaned: cleanup.failed_jobs_cleaned,
      failed_results: cleanup.failed_results,
    }, null, 2));
  }
}

if (!dryRun) {
  const residuals = [];
  for (const candidate of candidates) {
    const prefix = candidate.job.storage_prefix || ("backups/" + candidate.job.id + "/");
    const remaining = (await listStorageFiles(prefix.replace(/\/+$/g, "") + "/tables"))
      .filter((file) => /\.(json|csv)$/i.test(file.path));
    if (remaining.length > 0) {
      residuals.push({ id: candidate.job.id, remaining: remaining.length });
    }
  }
  const septPrefix = await listStorageFiles("backups/649ea45a-917e-4c4b-85d7-19d88366e05a");
  if (residuals.length > 0 || septPrefix.length > 0) {
    throw new Error("Post-cleanup verification failed: " + JSON.stringify({
      completed_prefixes_with_raw_files: residuals,
      september_01_remaining_objects: septPrefix.length,
    }));
  }
}

console.log(JSON.stringify({
  phase_complete: dryRun ? "dry_run_complete_no_deletes" : "execute_complete",
  verified_jobs: results.filter((item) => item.verified).length,
  failed_verifications: results.filter((item) => item.verified !== true).length,
  deleted_jobs: results.filter((item) => item.deleted).length,
  results,
}, null, 2));
