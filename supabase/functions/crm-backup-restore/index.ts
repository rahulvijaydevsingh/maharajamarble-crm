import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";
import {
  BACKUP_MODULES,
  MODULE_TO_TABLES,
  type BackupModuleKey,
  REPLACE_DELETE_ORDER,
  RESTORE_INSERT_ORDER,
  UPSERT_CONFLICT_TARGET,
} from "../_shared/crmBackupConfig.ts";

type RestoreBody = {
  mode: "merge" | "replace";
  includeModules?: BackupModuleKey[];
  sourceBackupId?: string;
  sourceFilePath?: string;
  restoreFiles?: boolean;
};

type BackupJson = {
  meta: { version: string; createdAt: string; createdBy: string | null; includeModules: BackupModuleKey[]; includeFiles: boolean };
  tables: Record<string, any[]>;
  files?: { manifest: Array<{ originalBucket: string; originalPath: string; backupPath: string }> };
};

function dedupeTables(modules: BackupModuleKey[]): string[] {
  const set = new Set<string>();
  for (const m of modules) {
    for (const t of MODULE_TO_TABLES[m] || []) set.add(t);
  }
  return [...set];
}

async function deleteAll(admin: any, table: string) {
  const pk = UPSERT_CONFLICT_TARGET[table] || "id";
  // PostgREST requires a filter for delete
  const { error } = await admin.from(table).delete().not(pk, "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function upsertRows(admin: any, table: string, rows: any[]) {
  if (!rows || rows.length === 0) return { inserted: 0 };
  const conflict = UPSERT_CONFLICT_TARGET[table];
  const { error } = conflict
    ? await admin.from(table).upsert(rows, { onConflict: conflict })
    : await admin.from(table).upsert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  return { inserted: rows.length };
}

async function insertRows(admin: any, table: string, rows: any[]) {
  if (!rows || rows.length === 0) return { inserted: 0 };
  const { error } = await admin.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  return { inserted: rows.length };
}

async function restoreFilesIfNeeded(admin: any, backupId: string | null, backup: BackupJson) {
  if (!backup.files?.manifest?.length) return { restored: 0, skipped: 0 };
  const bucketTo = "crm-attachments";
  const bucketFrom = "crm-backups";

  let restored = 0;
  let skipped = 0;
  for (const f of backup.files.manifest) {
    // If backupId is unknown (uploaded JSON only), we still have backupPath embedded.
    const backupPath = f.backupPath;
    const originalPath = f.originalPath;

    const { data: fileData, error: dlErr } = await admin.storage.from(bucketFrom).download(backupPath);
    if (dlErr) {
      skipped++;
      continue;
    }
    const contentType = fileData?.type || "application/octet-stream";
    const arrayBuffer = await fileData.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from(bucketTo)
      .upload(originalPath, new Uint8Array(arrayBuffer), { contentType, upsert: false });
    if (upErr) {
      // If already exists, ignore.
      skipped++;
      continue;
    }
    restored++;
  }
  return { restored, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return jsonResponse({ error: adminCheck.error }, { status: adminCheck.status });

  try {
    const body = await readJson<RestoreBody>(req);
    const mode = body.mode || "merge";
    const restoreFiles = Boolean(body.restoreFiles);

    const includeModules: BackupModuleKey[] =
      body.includeModules && body.includeModules.length > 0
        ? body.includeModules
        : (BACKUP_MODULES.map((m) => m.key) as BackupModuleKey[]);

    const admin = createAdminClient();

    const { data: restoreRow, error: restoreInsErr } = await admin
      .from("crm_restores")
      .insert({ status: "running", mode, include_modules: includeModules, source_backup_id: body.sourceBackupId || null, source_file_path: body.sourceFilePath || null })
      .select("*")
      .single();
    if (restoreInsErr) throw new Error(restoreInsErr.message);

    const restoreId = restoreRow.id as string;

    let jsonPath: string | null = null;
    let backupId: string | null = null;
    if (body.sourceBackupId) {
      backupId = body.sourceBackupId;
      const { data: backupRow, error: bErr } = await admin
        .from("crm_backups")
        .select("json_file_path")
        .eq("id", body.sourceBackupId)
        .single();
      if (bErr) throw new Error(bErr.message);
      jsonPath = backupRow?.json_file_path || null;
    } else if (body.sourceFilePath) {
      jsonPath = body.sourceFilePath;
    }

    if (!jsonPath) throw new Error("Missing source backup JSON");

    const { data: jsonBlob, error: dlErr } = await admin.storage.from("crm-backups").download(jsonPath);
    if (dlErr) throw new Error(dlErr.message);

    const text = await jsonBlob.text();
    const backup = JSON.parse(text) as BackupJson;

    if (!backup?.meta?.version || !backup?.tables) throw new Error("Invalid backup file");

    const tablesWanted = new Set(dedupeTables(includeModules));
    // Always include attachments metadata if restoring files
    if (restoreFiles) {
      for (const t of MODULE_TO_TABLES.attachments_files) tablesWanted.add(t);
    }

    const tableNames = [...tablesWanted].filter((t) => backup.tables[t]);

    const summary: any = {
      mode,
      includeModules,
      tablesProcessed: [] as any[],
      fileRestore: null as any,
      warnings: [] as string[],
    };

    if (mode === "replace") {
      for (const t of REPLACE_DELETE_ORDER) {
        if (!tablesWanted.has(t)) continue;
        await deleteAll(admin, t);
      }
    }

    // Insert / merge
    const insertOrder = RESTORE_INSERT_ORDER.filter((t) => tablesWanted.has(t));
    const remaining = new Set(tableNames);
    for (const t of insertOrder) {
      const rows = backup.tables[t] || [];
      const res = mode === "merge" ? await upsertRows(admin, t, rows) : await insertRows(admin, t, rows);
      summary.tablesProcessed.push({ table: t, rows: rows.length, action: mode, ok: true });
      remaining.delete(t);
    }
    // Any not in order, still restore
    for (const t of remaining) {
      const rows = backup.tables[t] || [];
      const res = mode === "merge" ? await upsertRows(admin, t, rows) : await insertRows(admin, t, rows);
      summary.tablesProcessed.push({ table: t, rows: rows.length, action: mode, ok: true });
    }

    if (restoreFiles) {
      summary.fileRestore = await restoreFilesIfNeeded(admin, backupId, backup);
    }

    await admin.from("crm_restores").update({ status: "success", result_summary: summary }).eq("id", restoreId);
    return jsonResponse({ success: true, restoreId, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
});
