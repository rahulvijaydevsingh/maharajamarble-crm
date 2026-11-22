import { useCallback, useEffect, useRef, useState } from 'react';

import { buildTelUrl } from '@/mobile/lib/format';
import type { EntityKind, PendingCallState } from '@/mobile/types/crmTypes';

export const PENDING_CALL_STORAGE_KEY = 'mm_pending_call_v1';
export const PENDING_CALL_TTL_MS = 30 * 60 * 1000;

export interface CallIntentTarget {
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  phone: string;
  taskId?: string | null;
}

export interface CallOutcomeTarget extends CallIntentTarget {
  /** True when the sheet was opened because the user came back from a call. */
  openedAfterCall: boolean;
}

/** Reads the persisted pending-call intent. Never throws. */
export function readPendingCall(): PendingCallState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_CALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCallState;
    if (!parsed || typeof parsed.startedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persists the pending-call intent. Never throws. */
export function writePendingCall(state: PendingCallState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PENDING_CALL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the in-memory state still drives this session */
  }
}

/** Clears the persisted pending-call intent. Never throws. */
export function clearPendingCall(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(PENDING_CALL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * True when a pending call is still actionable.
 *
 * A pending call expires 30 minutes after it started. A timestamp slightly in
 * the future (clock skew) is tolerated for one minute.
 */
export function isPendingCallValid(
  call: PendingCallState | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!call || typeof call.startedAt !== 'number') return false;
  if (nowMs - call.startedAt > PENDING_CALL_TTL_MS) return false;
  if (nowMs < call.startedAt - 60_000) return false;
  return true;
}

/**
 * Records the intent to call into localStorage.
 *
 * Any screen can call this from the click handler of its `tel:` link so the
 * call-outcome sheet knows who was called and opens once the user comes back
 * from the dialer. It is a module-level function on purpose: screens render
 * plain `tel:` anchors and do not need to own the watcher.
 */
export function recordCallIntent(target: CallIntentTarget): PendingCallState {
  const state: PendingCallState = {
    entityType: target.entityType,
    entityId: target.entityId,
    entityName: target.entityName,
    phone: target.phone,
    taskId: target.taskId ?? null,
    startedAt: Date.now(),
  };
  writePendingCall(state);
  return state;
}

/**
 * Watches for the user returning from a phone call.
 *
 * Behaviour required by the product spec:
 *  - The call outcome sheet must NEVER open before the user has actually left
 *    for the dialer. It only opens on a `visibilitychange`/`focus` event that
 *    follows an observed `hidden` state, or on a cold start that recovers a
 *    pending call written by an earlier session (OS tab eviction).
 *  - A manual "Log" tap opens the sheet immediately, without any pending call.
 *  - A pending call older than 30 minutes is discarded.
 */
export function useCallIntentWatcher() {
  const [callOutcomeTarget, setCallOutcomeTarget] = useState<CallOutcomeTarget | null>(null);
  const sawHiddenRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());

  const openCallOutcome = useCallback((target: CallIntentTarget) => {
    setCallOutcomeTarget({ ...target, openedAfterCall: false });
  }, []);

  const dismissCallOutcome = useCallback(() => {
    setCallOutcomeTarget(null);
    clearPendingCall();
  }, []);

  /**
   * Records the intent to call, then hands the device to the dialer.
   *
   * The sheet is deliberately NOT opened here — it opens only once the user
   * comes back.
   */
  const beginCall = useCallback((target: CallIntentTarget) => {
    recordCallIntent(target);

    if (typeof window !== 'undefined') {
      window.location.href = buildTelUrl(target.phone);
    }
  }, []);

  useEffect(() => {
    mountedAtRef.current = Date.now();

    const maybeOpenFromRecovery = () => {
      const pending = readPendingCall();
      if (!isPendingCallValid(pending)) {
        if (pending) clearPendingCall();
        return;
      }
      // Recovery after a reload: the intent was created before this page
      // instance existed, so the user must have left the app for the dialer.
      if (pending && pending.startedAt < mountedAtRef.current) {
        setCallOutcomeTarget({
          entityType: pending.entityType,
          entityId: pending.entityId,
          entityName: pending.entityName,
          phone: pending.phone,
          taskId: pending.taskId ?? null,
          openedAfterCall: true,
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sawHiddenRef.current = true;
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (!sawHiddenRef.current) return;

      const pending = readPendingCall();
      if (!isPendingCallValid(pending)) {
        if (pending) clearPendingCall();
        sawHiddenRef.current = false;
        return;
      }
      if (!pending) return;

      setCallOutcomeTarget((current) => {
        if (current) return current;
        return {
          entityType: pending.entityType,
          entityId: pending.entityId,
          entityName: pending.entityName,
          phone: pending.phone,
          taskId: pending.taskId ?? null,
          openedAfterCall: true,
        };
      });
      sawHiddenRef.current = false;
    };

    const onFocus = () => {
      if (!sawHiddenRef.current) return;
      onVisibilityChange();
    };

    maybeOpenFromRecovery();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return {
    callOutcomeTarget,
    beginCall,
    openCallOutcome,
    dismissCallOutcome,
    setCallOutcomeTarget,
  };
}
