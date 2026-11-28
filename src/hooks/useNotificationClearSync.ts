import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_PREFIX = 'mm_notif_cleared_at_v1:';
const REFRESH_THROTTLE_MS = 10_000;
const SYNC_EVENT = 'mm:notifications-cleared-sync';

export function notificationClearedStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function pickLaterIso(a: string | null, b: string | null): string | null {
  const left = validIso(a);
  const right = validIso(b);
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function readLocalClearedAt(userId: string | undefined): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return validIso(window.localStorage.getItem(notificationClearedStorageKey(userId)));
  } catch {
    return null;
  }
}

function writeLocalClearedAt(userId: string | undefined, iso: string): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(notificationClearedStorageKey(userId), iso);
  } catch {
    // Storage may be unavailable in private browsing; the in-memory state remains useful.
  }
}

function readMetadataTimestamp(metadata: Record<string, unknown> | undefined): string | null {
  const value = metadata?.notifications_cleared_at;
  return typeof value === 'string' ? validIso(value) : null;
}

export function useNotificationClearSync() {
  const { user } = useAuth();
  const userId = user?.id;
  const metaClearedAt = readMetadataTimestamp(user?.user_metadata);
  const [clearedAt, setClearedAt] = useState<string | null>(() =>
    pickLaterIso(metaClearedAt, readLocalClearedAt(userId)),
  );
  const [isClearing, setIsClearing] = useState(false);
  const lastRemoteFetchRef = useRef(0);
  const clearedAtRef = useRef(clearedAt);
  clearedAtRef.current = clearedAt;

  useEffect(() => {
    if (!userId) {
      setClearedAt(null);
      return;
    }
    const merged = pickLaterIso(metaClearedAt, readLocalClearedAt(userId));
    setClearedAt(merged);
    if (merged) writeLocalClearedAt(userId, merged);
  }, [userId, metaClearedAt]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const onCustomSync = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; iso: string }>).detail;
      if (detail?.userId !== userId || !validIso(detail.iso)) return;
      setClearedAt((previous) => pickLaterIso(previous, detail.iso));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== notificationClearedStorageKey(userId) || !event.newValue) return;
      const next = validIso(event.newValue);
      if (next) setClearedAt((previous) => pickLaterIso(previous, next));
    };

    window.addEventListener(SYNC_EVENT, onCustomSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onCustomSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const refreshFromServer = async () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRemoteFetchRef.current < REFRESH_THROTTLE_MS) return;
      lastRemoteFetchRef.current = now;

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) return;

        const remoteIso = readMetadataTimestamp(data.user?.user_metadata);
        const currentIso = clearedAtRef.current;
        const merged = pickLaterIso(currentIso, remoteIso);
        if (merged) {
          setClearedAt(merged);
          writeLocalClearedAt(userId, merged);
        }

        // A previous offline update is retried when the server is reachable again.
        if (currentIso && (!remoteIso || Date.parse(currentIso) > Date.parse(remoteIso))) {
          const { error: updateError } = await supabase.auth.updateUser({
            data: { notifications_cleared_at: currentIso },
          });
          if (!updateError) {
            setClearedAt((previous) => pickLaterIso(previous, currentIso));
          }
        }
      } catch {
        // A transient/offline metadata refresh must not block the CRM.
      }
    };

    const handleVisible = () => void refreshFromServer();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [userId]);

  const clearAllNotifications = useCallback(async () => {
    if (!userId) return;
    const nowIso = new Date().toISOString();
    setIsClearing(true);
    clearedAtRef.current = nowIso;
    setClearedAt(nowIso);
    writeLocalClearedAt(userId, nowIso);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { userId, iso: nowIso } }));
    }

    try {
      const { error } = await supabase.auth.updateUser({
        data: { notifications_cleared_at: nowIso },
      });
      if (error) throw error;
    } catch {
      // The local clear remains in effect and will be retried on the next foreground refresh.
    } finally {
      setIsClearing(false);
    }
  }, [userId]);

  return { clearedAt, clearAllNotifications, isClearing };
}
