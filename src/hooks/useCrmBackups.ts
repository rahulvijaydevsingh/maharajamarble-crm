import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  | "kit";

export type CrmBackupRow = {
  id: string;
  created_at: string;
  created_by: string;
  status: string;
  include_modules: BackupModuleKey[];
  json_file_path: string | null;
  xlsx_file_path: string | null;
  json_url?: string | null;
  xlsx_url?: string | null;
  result_summary?: any;
};

export function useCrmBackups() {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backups, setBackups] = useState<CrmBackupRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-backup-list", {
        method: "GET",
      });
      if (error) throw error;
      setBackups((data?.backups || []) as CrmBackupRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBackup = useCallback(
    async (params: { includeModules: BackupModuleKey[]; includeFiles: boolean }) => {
      setCreating(true);
      try {
        const { data, error } = await supabase.functions.invoke("crm-backup-create", {
          body: params,
        });
        if (error) throw error;
        await refresh();
        return data as any;
      } finally {
        setCreating(false);
      }
    },
    [refresh]
  );

  const uploadBackupJson = useCallback(async (file: File) => {
    const path = `uploads/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("crm-backups").upload(path, file, {
      contentType: "application/json",
      upsert: true,
    });
    if (error) throw error;
    return path;
  }, []);

  const restoreBackup = useCallback(
    async (params: {
      mode: "merge" | "replace";
      includeModules: BackupModuleKey[];
      sourceBackupId?: string;
      sourceFilePath?: string;
      restoreFiles: boolean;
    }) => {
      setRestoring(true);
      try {
        const { data, error } = await supabase.functions.invoke("crm-backup-restore", {
          body: params,
        });
        if (error) throw error;
        await refresh();
        return data as any;
      } finally {
        setRestoring(false);
      }
    },
    [refresh]
  );

  return {
    backups,
    loading,
    creating,
    restoring,
    refresh,
    createBackup,
    uploadBackupJson,
    restoreBackup,
  };
}
