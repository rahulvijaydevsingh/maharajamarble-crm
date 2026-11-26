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
  detectDuplicatePhoneConflict,
  hasClientMutationId,
  isForceSavedMutation,
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
  /** Last error raised by the outbox (for example a failed forced save). */
  lastError: string | null;
  /** Clears {@link lastError}. */
  clearLastError: () => void;
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
  const { updateTask, addTask } = useTasks();
  const { addReminder, snoozeReminder, dismissReminder } = useReminders();
  const { logActivity } = useLogActivity();

  const [outbox, setOutbox] = useState<OutboxMutation[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const syncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  /** Mirror of the queue so `enqueue` never has to run inside a state updater. */
  const outboxRef = useRef<OutboxMutation[]>([]);
  /**
   * The live phone set lives in a ref on purpose: a `leads` refetch must not
   * rebuild the context value, which would re-open IndexedDB for every
   * consumer of the provider.
   */
  const livePhoneSetRef = useRef<Set<string>>(new Set());

  /* ----------------------------- persistence ----------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    void loadOutbox().then((queue) => {
      if (!mountedRef.current) return;
      outboxRef.current = queue;
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

  /**
   * Single write path for the queue: updates the ref, the state and the
   * durable store together.
   */
  const commitQueue = useCallback(
    (next: OutboxMutation[]) => {
      outboxRef.current = next;
      setOutbox(next);
      void persist(next);
    },
    [persist],
  );

  /* ------------------------------- enqueue ------------------------------- */

  const enqueue = useCallback<WeakSignalOutboxContextValue['enqueue']>(
    (input) => {
      const mutation = buildOutboxMutation(input);
      const current = outboxRef.current;

      // A mutation with the same `client_mutation_id` is already queued — the
      // replay is idempotent, so the queue is left untouched.
      if (hasClientMutationId(current, mutation.client_mutation_id)) {
        return mutation;
      }

      const next = appendToOutboxCapped(current, mutation, OUTBOX_MAX_ITEMS);
      // The persist call deliberately lives OUTSIDE the state updater: a
      // functional updater can run twice under React StrictMode, which would
      // write the durable queue twice.
      commitQueue(next);
      return mutation;
    },
    [commitQueue],
  );

  /* -------------------------------- replay ------------------------------- */

  useEffect(() => {
    const phones = new Set<string>();
    leads.forEach((lead) => {
      const digits = (lead.phone ?? '').replace(/\D/g, '');
      if (digits.length >= 10) phones.add(digits.slice(-10));
    });
    livePhoneSetRef.current = phones;
  }, [leads]);

  const applyMutation = useCallback(
    async (mutation: OutboxMutation): Promise<{ ok: boolean; conflict?: string }> => {
      const payload = (mutation.payload ?? {}) as Record<string, any>;

      switch (mutation.kind) {
        case 'create_lead': {
          // A forced save is the user explicitly asking to keep the record, so
          // the duplicate check is skipped for it.
          if (!isForceSavedMutation(mutation)) {
            const conflict = detectDuplicatePhoneConflict(mutation, livePhoneSetRef.current);
            if (conflict) return { ok: false, conflict };
          }
          const { forceSave, ...leadPayload } = (payload.lead ?? {}) as Record<string, unknown>;
          await addLead(leadPayload as unknown as Parameters<typeof addLead>[0]);
          return { ok: true };
        }
        case 'update_lead': {
          if (!isForceSavedMutation(mutation)) {
            const conflict = detectDuplicatePhoneConflict(mutation, livePhoneSetRef.current);
            if (conflict) return { ok: false, conflict };
          }
          const { forceSave, ...updates } = (payload.updates ?? {}) as Record<string, unknown>;
          await updateLead(payload.leadId, updates);
          return { ok: true };
        }
        case 'create_task': {
          await addTask(payload.task);
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
            related_entity_type: payload.relatedEntityType ?? undefined,
            related_entity_id: payload.relatedEntityId ?? undefined,
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
            related_entity_type: payload.relatedEntityType ?? undefined,
            related_entity_id: payload.relatedEntityId ?? undefined,
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
    [addLead, addReminder, addTask, dismissReminder, logActivity, snoozeReminder, updateLead, updateTask],
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
      commitQueue(remaining);

      const retryable = remaining.filter((mutation) => mutation.status !== 'needs_review');
      if (retryable.length > 0) {
        const highestAttempt = retryable.reduce(
          (max, mutation) => Math.max(max, mutation.attempts ?? 0),
          0,
        );
        // Attempt 1 waits 2s, attempt 2 waits 5s, attempt 3+ waits 15s.
        scheduleRetry(Math.max(1, highestAttempt));
      }
    } finally {
      syncingRef.current = false;
      if (mountedRef.current) setIsSyncingOutbox(false);
    }
  }, [applyMutation, commitQueue, scheduleRetry]);

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
        commitQueue(removeFromOutbox(queue, mutationId));
        return;
      }

      // `force_create`: apply the mutation even though a duplicate was detected.
      let applied = false;
      try {
        const result = await applyMutation({
          ...target,
          payload: { ...target.payload, forceSave: true },
        });
        applied = result.ok === true;
      } catch {
        applied = false;
      }

      if (!applied) {
        // The forced apply failed — the mutation stays parked so the field user
        // can retry instead of losing the work silently.
        setLastError(
          'Could not save the queued update. It is still pending review — please try again.',
        );
        return;
      }

      setLastError(null);
      commitQueue(removeFromOutbox(queue, mutationId));
    },
    [applyMutation, commitQueue],
  );

  const discardOutboxMutation = useCallback(
    async (mutationId: string) => {
      const queue = await loadOutbox();
      commitQueue(removeFromOutbox(queue, mutationId));
    },
    [commitQueue],
  );

  const clearLastError = useCallback(() => setLastError(null), []);

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
      lastError,
      clearLastError,
      enqueue,
      syncOutboxNow,
      resolveOutboxConflict,
      discardOutboxMutation,
    }),
    [
      clearLastError,
      conflictCount,
      discardOutboxMutation,
      enqueue,
      isOnline,
      isSyncingOutbox,
      lastError,
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
    lastError: null,
    clearLastError: () => undefined,
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
