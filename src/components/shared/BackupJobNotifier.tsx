import { useEffect } from 'react';
import { useBackupJobsChannel, type BackupJobsRealtimePayload } from '@/contexts/BackupJobsContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function BackupJobNotifier() {
  const channel = useBackupJobsChannel();
  const { profile } = useAuth();
  const requesterName = profile?.full_name ?? '';

  useEffect(() => {
    if (!channel || !requesterName) return;
    const handler = (payload: BackupJobsRealtimePayload) => {
      if (payload.eventType !== 'UPDATE') return;
      const row = payload.new;
      const prev = payload.old;
      if (!row || row.requested_by !== requesterName) return;

      if (prev?.status === 'processing' && row.status === 'completed') {
        toast.success('Backup ready', {
          description: `Your backup requested by ${row.requested_by} is complete and ready for download.`,
        });
      } else if (prev?.status !== 'failed' && row.status === 'failed') {
        toast.error('Backup failed', {
          description: row.error_message || 'Unknown error',
        });
      }
    };
    channel.addListener(handler);
    return () => channel.removeListener(handler);
  }, [channel, requesterName]);

  return null;
}
