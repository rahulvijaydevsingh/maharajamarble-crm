import { useCallback, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { UPSERT_CONFLICT_TARGET } from "../../supabase/functions/_shared/crmBackupConfig";

export type BackupModuleKey =
  | "leads" | "customers" | "professionals" | "tasks" | "reminders"
  | "quotations" | "automation" | "communication" | "users_access"
  | "company_system" | "todo" | "attachments_files" | "kit"
  | "performance" | "staff_logs" | "whatsapp" | "hr_attendance" | "api_access";

export type RestoreProgress = {
  phase: "reading" | "restoring";
  currentTable?: string;
  tableIndex?: number;
  tableTotal?: number;
  batchIndex?: number;
  batchTotal?: number;
};

type StoredBackup = { zipPath: string; checksumSha256: string };
type RestoreInput = File | StoredBackup;
const RESTORE_BATCH_SIZE = 500;

async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isStoredBackup(input: RestoreInput): input is StoredBackup {
  return !(input instanceof File);
}

export function useCrmBackups() {
  const [restoring, setRestoring] = useState(false);

  const restoreBackup = useCallback(
    async (input: RestoreInput, onProgress?: (p: RestoreProgress) => void) => {
      setRestoring(true);
      try {
        onProgress?.({ phase: "reading" });

        let archiveBlob: Blob;
        if (isStoredBackup(input)) {
          if (!input.zipPath || !input.checksumSha256) {
            throw new Error("The selected backup has no verified ZIP path or SHA-256 checksum.");
          }
          const { data, error } = await supabase.storage.from("crm-backups").download(input.zipPath);
          if (error || !data) throw new Error(`Failed to download backup.zip: ${error?.message || "file missing"}`);
          archiveBlob = data;
          const actualChecksum = await sha256Hex(archiveBlob);
          if (actualChecksum.toLowerCase() !== input.checksumSha256.toLowerCase()) {
            throw new Error("Backup ZIP checksum mismatch. Restore was stopped before changing any CRM data.");
          }
        } else {
          const isZip = /\.zip$/i.test(input.name) || input.type === "application/zip";
          if (!isZip) throw new Error("Please select a backup.zip archive.");
          archiveBlob = input;
        }

        // CRC verification catches damaged ZIP members before any database writes begin.
        const zip = await JSZip.loadAsync(archiveBlob, { checkCRC32: true });
        const manifestEntry = zip.file("manifest.json");
        if (!manifestEntry) throw new Error("backup.zip is missing manifest.json.");

        let manifest: any;
        try {
          manifest = JSON.parse(await manifestEntry.async("string"));
        } catch {
          throw new Error("backup.zip contains an invalid manifest.json.");
        }

        const tables: string[] = Array.isArray(manifest?.tables) ? manifest.tables : [];
        const order: string[] = Array.isArray(manifest?.restoreOrder) ? manifest.restoreOrder : tables;
        if (tables.length === 0 || !Array.isArray(order) || order.length === 0) {
          throw new Error("Manifest has no valid table restore order.");
        }
        if (manifest.tableCount !== undefined && manifest.tableCount !== tables.length) {
          throw new Error("Manifest tableCount does not match its table list.");
        }
        if (new Set(tables).size !== tables.length || order.some((table) => !tables.includes(table))) {
          throw new Error("Manifest contains duplicate or unexpected table names.");
        }

        // Validate every expected JSON and CSV member before beginning the restore.
        // This prevents a partial restore caused by a ZIP with missing table files.
        const tableRows = new Map<string, any[]>();
        for (const table of tables) {
          const jsonEntry = zip.file(`tables/${table}.json`);
          const csvEntry = zip.file(`tables/${table}.csv`);
          if (!jsonEntry || !csvEntry) {
            throw new Error(`backup.zip is incomplete: expected tables/${table}.json and .csv.`);
          }
          let rows: unknown;
          try {
            rows = JSON.parse(await jsonEntry.async("string"));
          } catch {
            throw new Error(`tables/${table}.json is not valid JSON.`);
          }
          if (!Array.isArray(rows)) throw new Error(`tables/${table}.json must contain an array.`);
          tableRows.set(table, rows);
        }

        for (let i = 0; i < order.length; i++) {
          const table = order[i];
          const rows = tableRows.get(table);
          if (!rows) throw new Error(`Manifest restore order references unknown table: ${table}`);

          onProgress?.({
            phase: "restoring",
            currentTable: table,
            tableIndex: i + 1,
            tableTotal: order.length,
          });

          if (rows.length === 0) continue;
          const conflict = UPSERT_CONFLICT_TARGET[table] || "id";
          const batchTotal = Math.ceil(rows.length / RESTORE_BATCH_SIZE);
          for (let b = 0; b < batchTotal; b++) {
            const chunk = rows.slice(b * RESTORE_BATCH_SIZE, (b + 1) * RESTORE_BATCH_SIZE);
            onProgress?.({
              phase: "restoring",
              currentTable: table,
              tableIndex: i + 1,
              tableTotal: order.length,
              batchIndex: b + 1,
              batchTotal,
            });
            const { error } = await supabase.from(table as any).upsert(chunk, { onConflict: conflict });
            if (error) throw new Error(`${table} (batch ${b + 1}/${batchTotal}): ${error.message}`);
          }
        }

        return { tablesRestored: order.length };
      } finally {
        setRestoring(false);
      }
    },
    [],
  );

  return { restoring, restoreBackup };
}
