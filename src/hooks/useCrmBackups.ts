import { useCallback, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { UPSERT_CONFLICT_TARGET } from "../../supabase/functions/_shared/crmBackupConfig";

export type BackupModuleKey =
  | "leads"
  | "customers"
  | "professionals"
  | "tasks"
  | "reminders"
  | "quotations"
  | "automation"
  | "communication"
  | "users_access"
  | "company_system"
  | "todo"
  | "attachments_files"
  | "kit"
  | "performance"
  | "staff_logs"
  | "whatsapp"
  | "hr_attendance"
  | "api_access";

export type RestoreProgress = {
  phase: "reading" | "restoring";
  currentTable?: string;
  tableIndex?: number;
  tableTotal?: number;
  batchIndex?: number;
  batchTotal?: number;
};

const RESTORE_BATCH_SIZE = 500;

export function useCrmBackups() {
  const [restoring, setRestoring] = useState(false);

  async function fetchManifestForJob(
    manifestPath: string,
  ): Promise<{ manifest: any; storagePrefix: string }> {
    const { data, error } = await supabase.storage
      .from("crm-backups")
      .download(manifestPath);
    if (error || !data) throw new Error(`Failed to download manifest: ${error?.message || "missing"}`);
    const manifest = JSON.parse(await data.text());
    const storagePrefix = manifestPath.replace(/manifest\.json$/, "");
    return { manifest, storagePrefix };
  }

  async function loadTableFromStorage(prefix: string, table: string): Promise<any[]> {
    const { data, error } = await supabase.storage
      .from("crm-backups")
      .download(`${prefix}tables/${table}.json`);
    if (error || !data) throw new Error(`Missing table file: ${table}`);
    return JSON.parse(await data.text());
  }

  const restoreBackup = useCallback(
    async (
      input: File | { manifestPath: string },
      onProgress?: (p: RestoreProgress) => void,
    ) => {
      setRestoring(true);
      try {
        onProgress?.({ phase: "reading" });

        let manifest: any;
        let zip: JSZip | null = null;
        let storagePrefix: string | null = null;

        if (input instanceof File) {
          const isZip = /\.zip$/i.test(input.name) || input.type === "application/zip";
          if (isZip) {
            zip = await JSZip.loadAsync(input);
            const manifestEntry = zip.file("manifest.json");
            if (!manifestEntry) throw new Error("backup.zip is missing manifest.json");
            manifest = JSON.parse(await manifestEntry.async("string"));
          } else {
            // raw manifest.json upload — no prefix knowable; reject
            throw new Error(
              "Uploaded a raw manifest.json — please select a previous backup from the list instead, or upload the full .zip.",
            );
          }
        } else {
          const loaded = await fetchManifestForJob(input.manifestPath);
          manifest = loaded.manifest;
          storagePrefix = loaded.storagePrefix;
        }

        const order: string[] = manifest.restoreOrder || manifest.tables || [];
        if (!Array.isArray(order) || order.length === 0) {
          throw new Error("Manifest has no tables to restore.");
        }

        for (let i = 0; i < order.length; i++) {
          const table = order[i];
          onProgress?.({
            phase: "restoring",
            currentTable: table,
            tableIndex: i + 1,
            tableTotal: order.length,
          });

          let rows: any[] = [];
          try {
            if (zip) {
              const entry = zip.file(`tables/${table}.json`);
              if (!entry) continue;
              rows = JSON.parse(await entry.async("string"));
            } else if (storagePrefix) {
              rows = await loadTableFromStorage(storagePrefix, table);
            }
          } catch (e) {
            throw new Error(`Failed to read ${table}: ${(e as Error).message}`);
          }

          if (!Array.isArray(rows) || rows.length === 0) continue;

          const conflict = UPSERT_CONFLICT_TARGET[table] || "id";
          const batchTotal = Math.ceil(rows.length / RESTORE_BATCH_SIZE);
          for (let b = 0; b < batchTotal; b++) {
            const chunk = rows.slice(
              b * RESTORE_BATCH_SIZE,
              (b + 1) * RESTORE_BATCH_SIZE,
            );
            onProgress?.({
              phase: "restoring",
              currentTable: table,
              tableIndex: i + 1,
              tableTotal: order.length,
              batchIndex: b + 1,
              batchTotal,
            });
            const { error } = await supabase
              .from(table as any)
              .upsert(chunk, { onConflict: conflict });
            if (error) {
              throw new Error(
                `${table} (batch ${b + 1}/${batchTotal}): ${error.message}`,
              );
            }
          }
        }

        return { tablesRestored: order.length };
      } finally {
        setRestoring(false);
      }
    },
    [],
  );

  return {
    restoring,
    restoreBackup,
  };
}
