import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BackupJobRow = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  include_modules: string[];
  include_files: boolean;
  tables_to_export: string[] | null;
  tables_completed: string[];
  progress: { tables_done?: number; tables_total?: number; current_table?: string | null };
  storage_prefix: string | null;
  manifest_path: string | null;
  zip_path: string | null;
  error_message: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at: string | null;
};

export type BackupJobsRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: BackupJobRow;
  old: BackupJobRow;
};

type ListenerFn = (payload: BackupJobsRealtimePayload) => void;

interface BackupJobsContextValue {
  addListener: (fn: ListenerFn) => void;
  removeListener: (fn: ListenerFn) => void;
}

const BackupJobsContext = createContext<BackupJobsContextValue | null>(null);

export function BackupJobsProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<ListenerFn>>(new Set());

  useEffect(() => {
    const channel = supabase
      .channel('shared-backup-jobs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'backup_jobs' },
        (payload) => {
          listenersRef.current.forEach((fn) =>
            fn(payload as unknown as BackupJobsRealtimePayload)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addListener = (fn: ListenerFn) => {
    listenersRef.current.add(fn);
  };
  const removeListener = (fn: ListenerFn) => {
    listenersRef.current.delete(fn);
  };

  const value = useMemo(() => ({ addListener, removeListener }), []);
  return <BackupJobsContext.Provider value={value}>{children}</BackupJobsContext.Provider>;
}

export function useBackupJobsChannel(): BackupJobsContextValue | null {
  return useContext(BackupJobsContext);
}
