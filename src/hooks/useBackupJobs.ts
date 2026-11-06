import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBackupJobsChannel,
  type BackupJobRow,
  type BackupJobsRealtimePayload,
} from '@/contexts/BackupJobsContext';
import type { BackupModuleKey } from '@/hooks/useCrmBackups';

export function useBackupJobs() {
  const { profile } = useAuth();
  const channel = useBackupJobsChannel();
  const [jobs, setJobs] = useState<BackupJobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('backup_jobs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error && data) setJobs(data as unknown as BackupJobRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!channel) return;
    const handler = (payload: BackupJobsRealtimePayload) => {
      const row = payload.new;
      if (payload.eventType === 'DELETE' || (!row && payload.old?.id)) {
        setJobs((prev) => prev.filter((j) => j.id !== payload.old?.id));
        return;
      }
      if (!row) return;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === row.id);
        const next = [...prev];
        if (idx === -1) {
          next.push(row);
        } else {
          next[idx] = row;
        }
        next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return next.slice(0, 20);
      });
    };
    channel.addListener(handler);
    return () => channel.removeListener(handler);
  }, [channel]);

  const createBackupJob = useCallback(
    async (params: { includeModules: BackupModuleKey[]; includeFiles: boolean }) => {
      const backupJobs = supabase.from('backup_jobs') as any;
      const { data, error } = await backupJobs
        .insert({
          include_modules: params.includeModules,
          include_files: params.includeFiles,
          requested_by: profile?.full_name ?? 'Unknown',
          status: 'pending',
          progress: {},
          tables_completed: [],
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const job = data as BackupJobRow;

      // The database insert trigger uses a legacy anon request. Start the worker
      // explicitly with the signed-in administrator session instead.
      const { data: workerData, error: workerError } = await supabase.functions.invoke("crm-backup-worker", {
        body: { job_id: job.id },
      });
      if (workerError || workerData?.error) {
        const message = workerError?.message || workerData?.error || "Worker invocation failed.";
        await backupJobs.update({
          status: "failed",
          error_message: `Worker could not start: ${message}`,
        }).eq("id", job.id);
        throw new Error(`Backup job was created but the worker could not start: ${message}`);
      }
      return job;
    },
    [profile?.full_name]
  );

  return { jobs, loading, createBackupJob, refetch: fetchJobs };
}
