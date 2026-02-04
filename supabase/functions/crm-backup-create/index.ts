import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";
import { BACKUP_MODULES, MODULE_TO_TABLES, type BackupModuleKey } from "../_shared/crmBackupConfig.ts";

type CreateBackupBody = {
  includeModules?: BackupModuleKey[];
  includeFiles?: boolean;
};

type BackupJson = {
  meta: {
    version: string;
    createdAt: string;
    createdBy: string | null;
    includeModules: BackupModuleKey[];
    includeFiles: boolean;
  };
  tables: Record<string, any[]>;
  files?: {
    manifest: Array<{ originalBucket: string; originalPath: string; backupPath: string }>;
  };
};

const BACKUP_VERSION = "1.0.0";
const PAGE_SIZE = 1000;

async function fetchAllRows(admin: any, table: string) {
  const rows: any[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function dedupeTables(modules: BackupModuleKey[]): string[] {
  const set = new Set<string>();
  for (const m of modules) {
    for (const t of MODULE_TO_TABLES[m] || []) set.add(t);
  }
  return [...set];
}

function buildWorkbook(tables: Record<string, any[]>, meta: BackupJson["meta"]) {
  const wb = XLSX.utils.book_new();

  const readmeRows = [
    ["CRM Backup"],
    ["Version", meta.version],
    ["Created At", meta.createdAt],
    ["Created By", meta.createdBy || ""],
    ["Modules", meta.includeModules.join(", ")],
    ["Include Files", meta.includeFiles ? "Yes" : "No"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows), "README");

  for (const [table, rows] of Object.entries(tables)) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    // Excel sheet name max 31 chars
    XLSX.utils.book_append_sheet(wb, sheet, table.slice(0, 31));
  }

  return wb;
}

async function copyFilesIntoBackup(admin: any, backupId: string, tables: Record<string, any[]>) {
  const manifest: Array<{ originalBucket: string; originalPath: string; backupPath: string }> = [];
  const bucketFrom = "crm-attachments";
  const bucketTo = "crm-backups";

  // entity_attachments.file_path
  const paths = new Set<string>();
  for (const row of tables.entity_attachments || []) {
    if (row?.file_path) paths.add(String(row.file_path));
  }
  for (const row of tables.quotation_attachments || []) {
    if (row?.file_path) paths.add(String(row.file_path));
  }
  // messages.file_url may contain a signed URL; skip if not a storage path
  // (restoring message file links precisely is app-specific; we back up attachment tables instead)

  for (const originalPath of paths) {
    const backupPath = `backups/${backupId}/files/${originalPath}`;
    const { data: fileData, error: dlErr } = await admin.storage.from(bucketFrom).download(originalPath);
    if (dlErr) {
      manifest.push({ originalBucket: bucketFrom, originalPath, backupPath, /* best-effort */ } as any);
      continue;
    }
    const contentType = fileData?.type || "application/octet-stream";
    const arrayBuffer = await fileData.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from(bucketTo)
      .upload(backupPath, new Uint8Array(arrayBuffer), { contentType, upsert: true });
    if (upErr) {
      manifest.push({ originalBucket: bucketFrom, originalPath, backupPath } as any);
      continue;
    }
    manifest.push({ originalBucket: bucketFrom, originalPath, backupPath });
  }

  return { manifest };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return jsonResponse({ error: adminCheck.error }, { status: adminCheck.status });

  try {
    const body = await readJson<CreateBackupBody>(req);
    const includeFiles = Boolean(body.includeFiles);
    const includeModules: BackupModuleKey[] =
      body.includeModules && body.includeModules.length > 0
        ? body.includeModules
        : (BACKUP_MODULES.map((m) => m.key) as BackupModuleKey[]);

    const admin = createAdminClient();

    // Create tracking row
    const { data: backupRow, error: insErr } = await admin
      .from("crm_backups")
      .insert({ status: "running", include_modules: includeModules, formats: ["json", "xlsx"] })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    const backupId = backupRow.id as string;
    const tablesToExport = dedupeTables(includeModules);

    const tables: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    for (const table of tablesToExport) {
      const rows = await fetchAllRows(admin, table);
      tables[table] = rows;
      counts[table] = rows.length;
    }

    const backupJson: BackupJson = {
      meta: {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        createdBy: adminCheck.userEmail,
        includeModules,
        includeFiles,
      },
      tables,
    };

    if (includeFiles) {
      const files = await copyFilesIntoBackup(admin, backupId, tables);
      backupJson.files = { manifest: files.manifest };
    }

    const jsonPath = `backups/${backupId}/backup.json`;
    const xlsxPath = `backups/${backupId}/backup.xlsx`;

    const jsonBytes = new TextEncoder().encode(JSON.stringify(backupJson));
    const { error: jsonUpErr } = await admin.storage
      .from("crm-backups")
      .upload(jsonPath, jsonBytes, { contentType: "application/json", upsert: true });
    if (jsonUpErr) throw new Error(jsonUpErr.message);

    const wb = buildWorkbook(tables, backupJson.meta);
    const xlsxArray = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const { error: xlsxUpErr } = await admin.storage
      .from("crm-backups")
      .upload(xlsxPath, new Uint8Array(xlsxArray), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (xlsxUpErr) throw new Error(xlsxUpErr.message);

    const { data: jsonSigned } = await admin.storage.from("crm-backups").createSignedUrl(jsonPath, 60 * 60);
    const { data: xlsxSigned } = await admin.storage.from("crm-backups").createSignedUrl(xlsxPath, 60 * 60);

    const resultSummary = {
      counts,
      includeModules,
      includeFiles,
      generatedAt: backupJson.meta.createdAt,
      warnings: [] as string[],
    };

    await admin
      .from("crm_backups")
      .update({
        status: "success",
        json_file_path: jsonPath,
        xlsx_file_path: xlsxPath,
        result_summary: resultSummary,
      })
      .eq("id", backupId);

    return jsonResponse({
      success: true,
      backupId,
      json: { path: jsonPath, url: jsonSigned?.signedUrl || null },
      xlsx: { path: xlsxPath, url: xlsxSigned?.signedUrl || null },
      resultSummary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
});
