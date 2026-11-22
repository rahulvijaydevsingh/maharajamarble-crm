import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useLeads } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useLogActivity } from '@/hooks/useActivityLog';

import type { OutboxMutation } from '@/mobile/types/crmTypes';
import {
  OUTBOX_MAX_ITEMS,
  appendToOutboxCapped,
  buildOutboxMutation,
  dedupeByClientMutationId,
  detectDuplicatePhoneConflict,
  loadOutbox,
  markNeedsReview,
  nextBackoffMs,
  removeFromOutbox,
  saveOutbox,
  withIncrementedAttempt,
  type OutboxConflictResolution,
} from '@/mobile/outbox/weakSignalOutbox';

export interface WeakSignalOutboxContextValue {
  /** The durable queue, oldest first. */
  outbox: OutboxMutation[];
  /** True when the browser reports a network connection. */
  isOnline: boolean;
  /** True while the queue is being replayed. */
  isSyncingOutbox: boolean;
  /** Number of mutations waiting for a human decision. */
  conflictCount: number;
  /** Parks a mutation on the device. Returns the queued mutation. */
  enqueue: (input: {
    clientMutationId?: string;
    kind: OutboxMutation['kind'];
    label: string;
    payload: Record<string, unknown>;
  }) => OutboxMutation;
  /** Attempts to replay the queue immediately. */
  syncOutboxNow: () => Promise<void>;
  /** Resolves a parked conflict. */
  resolveOutboxConflict: (
    mutationId: string,
    resolution: OutboxConflictResolution,
  ) => Promise<void>;
  /** Drops a mutation without applying it. */
  discardOutboxMutation: (mutationId: string) => Promise<void>;
}

const WeakSignalOutboxContext = createContext<WeakSignalOutboxContextValue | undefined>(undefined);

export const WeakSignalOutboxProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { leads, addLead, updateLead } = useLeads();
  const { tasks, updateTask } = useTasks();
  const { addReminder, snoozeReminder, dismissReminder } = useReminders();
  const { logActivity } = useLogActivity();

  const [outbox, setOutbox] = useState<OutboxMutation[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);

  const syncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  /* ----------------------------- persistence ----------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    void loadOutbox().then((queue) => {
      if (!mountedRef.current) return;
      setOutbox(queue);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const persist = useCallback(async (queue: OutboxMutation[]) => {
    await saveOutbox(queue);
  }, []);

  /* ------------------------------- enqueue ------------------------------- */

  const enqueue = useCallback<WeakSignalOutboxContextValue['enqueue']>(
    (input) => {
      const mutation = buildOutboxMutation(input);
      let queued = mutation;
      setOutbox((prev) => {
        const deduped = dedupeByClientMutationId(prev, mutation);
        if (deduped === prev) return prev;
        const next = appendToOutboxCapped(deduped, mutation, OUTBOX_MAX_ITEMS);
        void persist(next);
        return next;
      });
      return queued;
    },
    [persist],
  );

  /* -------------------------------- replay ------------------------------- */

  const livePhoneSet = useMemo(() => {
    const phones = new Set<string>();
    leads.forEach((lead) => {
      const digits = (lead.phone ?? '').replace(/\D/g, '');
      if (digits.length >= 10) phones.add(digits.slice(-10));
    });
    return phones;
  }, [leads]);

  const applyMutation = useCallback(
    async (mutation: OutboxMutation): Promise<{ ok: boolean; conflict?: string }> => {
      const payload = (mutation.payload ?? {}) as Record<string, any>;

      switch (mutation.kind) {
        case 'create_lead': {
          const conflict = detectDuplicatePhoneConflict(mutation, livePhoneSet);
          if (conflict) return { ok: false, conflict };
          await addLead(payload.lead);
          return { ok: true };
        }
        case 'update_lead': {
          await updateLead(payload.leadId, payload.updates);
          return { ok: true };
        }
        case 'task_action': {
          await updateTask(payload.taskId, payload.updates);
          return { ok: true };
        }
        case 'log_call': {
          if (payload.taskId) {
            await updateTask(payload.taskId, payload.updates ?? {});
          }
          await logActivity({
            lead_id: payload.leadId ?? undefined,
            customer_id: payload.customerId ?? undefined,
            activity_type: 'phone_call',
            activity_category: 'communication',
            title: payload.title ?? 'Call logged',
            description: payload.note ?? undefined,
            metadata: { outcome: payload.outcome ?? null },
          });
          return { ok: true };
        }
        case 'add_note': {
          await logActivity({
            lead_id: payload.leadId ?? undefined,
            customer_id: payload.customerId ?? undefined,
            activity_type: 'custom_note',
            activity_category: 'note',
            title: payload.title ?? 'Note added',
            description: payload.content ?? undefined,
          });
          return { ok: true };
        }
        case 'add_reminder': {
          await addReminder(payload.reminder);
          return { ok: true };
        }
        case 'snooze_reminder': {
          await snoozeReminder(payload.reminderId, new Date(payload.snoozeUntil));
          return { ok: true };
        }
        case 'done_reminder': {
          await dismissReminder(payload.reminderId);
          return { ok: true };
        }
        default:
          return { ok: false };
      }
    },
    [addLead, addReminder, dismissReminder, livePhoneSet, logActivity, snoozeReminder, updateLead, updateTask],
  );

  const scheduleRetry = useCallback((attempt: number) => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
    }
    const delay = nextBackoffMs(attempt);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void syncRef.current?.();
    }, delay);
  }, []);

  const syncOutboxNow = useCallback(async () => {
    if (syncingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    syncingRef.current = true;
    setIsSyncingOutbox(true);

    try {
      const queue = await loadOutbox();
      if (!mountedRef.current) return;

      const remaining: OutboxMutation[] = [];

      for (const mutation of queue) {
        if (mutation.status === 'needs_review') {
          remaining.push(mutation);
          continue;
        }
        try {
          const result = await applyMutation(mutation);
          if (result.ok) continue;
          if (result.conflict) {
            remaining.push(markNeedsReview(mutation, result.conflict));
            continue;
          }
          remaining.push(withIncrementedAttempt(mutation));
        } catch {
          remaining.push(withIncrementedAttempt(mutation));
        }
      }

      if (!mountedRef.current) return;
      setOutbox(remaining);
      await persist(remaining);

      const retryable = remaining.filter((mutation) => mutation.status !== 'needs_review');
      if (retryable.length > 0) {
        const highestAttempt = retryable.reduce(
          (max, mutation) => Math.max(max, mutation.attempts ?? 0),
          0,
        );
        scheduleRetry(highestAttempt + 1);
      }
    } finally {
      syncingRef.current = false;
      if (mountedRef.current) setIsSyncingOutbox(false);
    }
  }, [applyMutation, persist, scheduleRetry]);

  const syncRef = useRef<(() => Promise<void>) | null>(null);
  syncRef.current = syncOutboxNow;

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void syncOutboxNow();
  }, [isOnline, syncOutboxNow]);

  /* ----------------------------- conflict UI ---------------------------- */

  const resolveOutboxConflict = useCallback(
    async (mutationId: string, resolution: OutboxConflictResolution) => {
      const queue = await loadOutbox();
      const target = queue.find((mutation) => mutation.id === mutationId);
      if (!target) return;

      if (resolution === 'merge_discard') {
        const next = removeFromOutbox(queue, mutationId);
        setOutbox(next);
        await persist(next);
        return;
      }

      // `force_create`: apply the mutation even though a duplicate was detected.
      try {
        await applyMutation({ ...target, payload: { ...target.payload, forceSave: true } });
      } catch {
        /* keep it parked if the forced apply still fails */
      }
      const next = removeFromOutbox(queue, mutationId);
      setOutbox(next);
      await persist(next);
    },
    [applyMutation, persist],
  );

  const discardOutboxMutation = useCallback(
    async (mutationId: string) => {
      const queue = await loadOutbox();
      const next = removeFromOutbox(queue, mutationId);
      setOutbox(next);
      await persist(next);
    },
    [persist],
  );

  const conflictCount = useMemo(
    () => outbox.filter((mutation) => mutation.status === 'needs_review').length,
    [outbox],
  );

  const value = useMemo<WeakSignalOutboxContextValue>(
    () => ({
      outbox,
      isOnline,
      isSyncingOutbox,
      conflictCount,
      enqueue,
      syncOutboxNow,
      resolveOutboxConflict,
      discardOutboxMutation,
    }),
    [
      conflictCount,
      discardOutboxMutation,
      enqueue,
      isOnline,
      isSyncingOutbox,
      outbox,
      resolveOutboxConflict,
      syncOutboxNow,
    ],
  );

  return (
    <WeakSignalOutboxContext.Provider value={value}>{children}</WeakSignalOutboxContext.Provider>
  );
};

/**
 * Access the weak-signal outbox.
 *
 * Returns a safe no-op implementation when used outside the provider so a
 * screen can be rendered in isolation (for example in a test) without
 * crashing.
 */
export function useWeakSignalOutbox(): WeakSignalOutboxContextValue {
  const context = useContext(WeakSignalOutboxContext);
  if (context) return context;

  return {
    outbox: [],
    isOnline: true,
    isSyncingOutbox: false,
    conflictCount: 0,
    enqueue: (input) =>
      buildOutboxMutation({
        kind: input.kind,
        label: input.label,
        payload: input.payload,
        clientMutationId: input.clientMutationId,
      }),
    syncOutboxNow: async () => undefined,
    resolveOutboxConflict: async () => undefined,
    discardOutboxMutation: async () => undefined,
  };
}
