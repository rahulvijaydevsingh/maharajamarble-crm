import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRemindersChannel, type RemindersRealtimePayload } from '@/contexts/RemindersContext';
import type { Reminder } from '@/hooks/useReminders';
import { getEffectiveReminderTriggerMs } from '@/lib/reminderBellState';

function sortReminders(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((left, right) => {
    const leftMs = getEffectiveReminderTriggerMs(left) ?? Number.MAX_SAFE_INTEGER;
    const rightMs = getEffectiveReminderTriggerMs(right) ?? Number.MAX_SAFE_INTEGER;
    return leftMs - rightMs;
  });
}

/**
 * Mobile's notification inbox needs future and currently-due reminders.
 * This hook reuses the app's single RemindersProvider channel and only polls
 * as a fallback/catch-up; it never creates another Realtime subscription.
 */
export function useMobileReminderFeed() {
  const { user, profile, loading: authLoading } = useAuth();
  const channel = useRemindersChannel();
  const assignedTo = profile?.full_name?.trim() || '';
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = useCallback(async () => {
    if (authLoading || !user?.id || !assignedTo) {
      setReminders([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('assigned_to', assignedTo)
        .eq('is_dismissed', false)
        .order('reminder_datetime', { ascending: true });
      if (error) throw error;
      setReminders(sortReminders((data ?? []) as Reminder[]));
    } catch (error) {
      console.warn('[mobile reminders] Could not refresh reminder feed.', error);
    } finally {
      setLoading(false);
    }
  }, [assignedTo, authLoading, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !assignedTo) {
      setReminders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchReminders();

    const onPayload = (payload: RemindersRealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const deletedId = payload.old.id;
        if (typeof deletedId === 'string') {
          setReminders((previous) => previous.filter((reminder) => reminder.id !== deletedId));
        }
        return;
      }

      const updated = payload.new as unknown as Reminder;
      if (!updated?.id) return;
      if (updated.assigned_to !== assignedTo || updated.is_dismissed) {
        setReminders((previous) => previous.filter((reminder) => reminder.id !== updated.id));
        return;
      }
      setReminders((previous) => {
        const next = previous.filter((reminder) => reminder.id !== updated.id);
        return sortReminders([...next, updated]);
      });
    };

    channel?.addListener(onPayload);

    const poll = window.setInterval(() => void fetchReminders(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchReminders();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      channel?.removeListener(onPayload);
    };
  }, [assignedTo, authLoading, channel, fetchReminders, user?.id]);

  return { reminders, loading, refetch: fetchReminders };
}
