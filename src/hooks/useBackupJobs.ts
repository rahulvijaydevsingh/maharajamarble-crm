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
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('backup_jobs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (!error && data) setJobs(data as unknown as BackupJobRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

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
        if (idx === -1) return [row, ...prev].slice(0, 20);
        const next = [...prev];
        next[idx] = row;
        return next;
      });
    };
    channel.addListener(handler);
    return () => channel.removeListener(handler);
  }, [channel]);

  const createBackupJob = useCallback(
    async (params: { includeModules: BackupModuleKey[]; includeFiles: boolean }) => {
      const { data, error } = await supabase
        .from('backup_jobs' as any)
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
      return data as unknown as BackupJobRow;
    },
    [profile?.full_name]
  );

  return { jobs, loading, createBackupJob, refetch: fetchJobs };
}
