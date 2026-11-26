import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useLeads } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { useReminders } from '@/hooks/useReminders';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useToast } from '@/hooks/use-toast';
import { normalizePhone10 } from '@/lib/phone';
import { supabase } from '@/integrations/supabase/client';

import type { OutboxMutation } from '@/mobile/types/crmTypes';
import {
  OUTBOX_FULL_MESSAGE,
  OUTBOX_LEAD_REPLAY_WINDOW_MS,
  OUTBOX_MAX_ITEMS,
  appendToOutboxOrRefuse,
  buildActivityMetadata,
  buildOutboxMutation,
  computeNextAttemptAt,
  detectDuplicatePhoneConflict,
  hasClientMutationId,
  hasPendingOutboxWork,
  isDuplicateLeadForReplay,
  isDuplicateReminderForReplay,
  isForceSavedMutation,
  loadOutbox,
  markNeedsReview,
  readMutationPhone,
  removeFromOutbox,
  saveOutbox,
  shouldRunOutboxSync,
  withIncrementedAttempt,
  withNextAttempt,
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

/** Narrows an unknown value to a plain object without `any`. */
function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Reads a string field out of an unknown payload. */
function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * True when a note or a call with this idempotency key was already written.
 *
 * The `client_mutation_id` lives in the `metadata` JSONB of the activity row,
 * so a replay after a dropped response finds the row and skips the insert.
 */
async function activityMutationExists(clientMutationId: string | undefined): Promise<boolean> {
  if (!clientMutationId) return false;
  const { data, error } = await supabase
    .from('activity_log')
    .select('id')
    .eq('metadata->>client_mutation_id', clientMutationId)
    .limit(1);
  // A failed lookup must never look like "not applied" — that would duplicate
  // the row. The error is thrown so the mutation is retried instead.
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * True when a lead with the same phone and the same owner was created inside
 * the replay window — the first attempt landed and only the response was lost.
 */
async function recentLeadExists(phone: string, createdBy: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - OUTBOX_LEAD_REPLAY_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('leads')
    .select('id, phone, created_by, created_at')
    .gte('created_at', windowStart)
    .limit(100);
  if (error) throw error;
  return (data ?? []).some((lead) => isDuplicateLeadForReplay(lead, phone, createdBy));
}

/** True when an identical reminder already exists. */
async function reminderExists(candidate: {
  entity_type: string | null;
  entity_id: string | null;
  reminder_datetime: string | null;
  title: string | null;
}): Promise<boolean> {
  if (!candidate.entity_type || !candidate.entity_id || !candidate.title) return false;
  const { data, error } = await supabase
    .from('reminders')
    .select('id, entity_type, entity_id, reminder_datetime, title')
    .eq('entity_type', candidate.entity_type)
    .eq('entity_id', candidate.entity_id)
    .eq('title', candidate.title)
    .limit(20);
  if (error) throw error;
  return (data ?? []).some((row) => isDuplicateReminderForReplay(row, candidate));
}

export const WeakSignalOutboxProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;

  const { leads, addLead, updateLead } = useLeads();
  const { updateTask, addTask } = useTasks();
  const { addReminder, snoozeReminder, dismissReminder } = useReminders();
  const { logActivity } = useLogActivity();
  const { toast } = useToast();

  const [outbox, setOutbox] = useState<OutboxMutation[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const syncingRef = useRef(false);
  /** Guards against two triggers replaying the queue at the same time. */
  const syncInFlightRef = useRef(false);
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

  /* ------------------------------- scoping ------------------------------- */

  /**
   * The signed-in user owns the durable queue.
   *
   * The ref is refreshed during render so the stable sync function always
   * reads the current user without becoming unstable itself.
   */
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  /* ----------------------------- persistence ----------------------------- */

  const persist = useCallback(async (queue: OutboxMutation[]) => {
    await saveOutbox(queue, userIdRef.current);
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

  const commitQueueRef = useRef(commitQueue);
  commitQueueRef.current = commitQueue;

  /* ------------------------------ scheduling ----------------------------- */

  /**
   * Arms exactly one timer for the earliest pending attempt.
   *
   * When there is nothing to retry no timer is armed at all, so an idle app
   * never spins.
   */
  const armRetryTimer = useCallback((queue: OutboxMutation[]) => {
    if (retryTimerRef.current !== null) {
      if (typeof window !== 'undefined') window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const nextAttemptAt = computeNextAttemptAt(queue, Date.now());
    if (nextAttemptAt === null) return;
    if (typeof window === 'undefined') return;

    const delay = Math.max(0, nextAttemptAt - Date.now());
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void syncRef.current?.();
    }, delay);
  }, []);

  const armRetryTimerRef = useRef(armRetryTimer);
  armRetryTimerRef.current = armRetryTimer;

  /* ------------------------------- enqueue ------------------------------- */

  const enqueue = useCallback<WeakSignalOutboxContextValue['enqueue']>(
    (input) => {
      const mutation = buildOutboxMutation(input);
      const current = outboxRef.current;

      // A mutation with the same `client_mutation_id` is already queued — the
      // replay is idempotent, so the queue is left untouched.
      if (hasClientMutationId(current, mutation.client_mutation_id)) return mutation;

      // The new mutation is scheduled for its first attempt so the scheduler
      // can arm exactly one timer for it.
      const scheduled = withNextAttempt(mutation);
      const { queue, refused } = appendToOutboxOrRefuse(current, scheduled, OUTBOX_MAX_ITEMS);

      if (refused) {
        // The queue is full: the new work is REFUSED, never stored and never
        // silently traded against the oldest queued mutation.
        toast({ title: OUTBOX_FULL_MESSAGE });
        return { ...mutation, status: 'full' };
      }

      // The persist call deliberately lives OUTSIDE the state updater: a
      // functional updater can run twice under React StrictMode, which would
      // write the durable queue twice.
      commitQueueRef.current(queue);
      armRetryTimerRef.current(queue);
      return scheduled;
    },
    [toast],
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

  /**
   * The owner written on a lead created by the replay.
   *
   * It mirrors what `addLead` stores, so the replay guard compares like with
   * like.
   */
  const creatorValue =
    profile?.full_name || user?.email || user?.id || 'unknown';

  const applyMutation = useCallback(
    async (mutation: OutboxMutation): Promise<{ ok: boolean; conflict?: string }> => {
      const payload = toRecord(mutation.payload);

      switch (mutation.kind) {
        case 'create_lead': {
          // A forced save is the user explicitly asking to keep the record, so
          // the duplicate check is skipped for it.
          if (!isForceSavedMutation(mutation)) {
            const conflict = detectDuplicatePhoneConflict(mutation, livePhoneSetRef.current);
            if (conflict) return { ok: false, conflict };
          }

          // Idempotent replay: the first attempt may have landed without the
          // response ever reaching the device.
          const phone10 = normalizePhone10(readMutationPhone(payload));
          if (phone10) {
            if (await recentLeadExists(phone10, creatorValue)) return { ok: true };
          }

          const { forceSave, ...leadPayload } = toRecord(payload.lead);
          await addLead({
            ...leadPayload,
            created_by: creatorValue,
          } as unknown as Parameters<typeof addLead>[0]);
          return { ok: true };
        }
        case 'update_lead': {
          if (!isForceSavedMutation(mutation)) {
            const conflict = detectDuplicatePhoneConflict(mutation, livePhoneSetRef.current);
            if (conflict) return { ok: false, conflict };
          }
          const { forceSave, ...updates } = toRecord(payload.updates);
          await updateLead(
            payload.leadId as string,
            updates as unknown as Parameters<typeof updateLead>[1],
          );
          return { ok: true };
        }
        case 'create_task': {
          await addTask(payload.task as Parameters<typeof addTask>[0]);
          return { ok: true };
        }
        case 'task_action': {
          await updateTask(
            payload.taskId as string,
            (payload.updates ?? {}) as unknown as Parameters<typeof updateTask>[1],
          );
          return { ok: true };
        }
        case 'log_call': {
          // The activity row carries the idempotency key: when it is already
          // there the whole call log was applied before.
          if (await activityMutationExists(mutation.client_mutation_id)) return { ok: true };
          if (payload.taskId) {
            await updateTask(
              payload.taskId as string,
              (payload.updates ?? {}) as Parameters<typeof updateTask>[1],
            );
          }
          await logActivity({
            lead_id: (payload.leadId as string) ?? undefined,
            customer_id: (payload.customerId as string) ?? undefined,
            related_entity_type: (payload.relatedEntityType as string) ?? undefined,
            related_entity_id: (payload.relatedEntityId as string) ?? undefined,
            activity_type: 'phone_call',
            activity_category: 'communication',
            title: (payload.title as string) ?? 'Call logged',
            description: (payload.note as string) ?? undefined,
            metadata: buildActivityMetadata(mutation),
          });
          return { ok: true };
        }
        case 'add_note': {
          if (await activityMutationExists(mutation.client_mutation_id)) return { ok: true };
          await logActivity({
            lead_id: (payload.leadId as string) ?? undefined,
            customer_id: (payload.customerId as string) ?? undefined,
            related_entity_type: (payload.relatedEntityType as string) ?? undefined,
            related_entity_id: (payload.relatedEntityId as string) ?? undefined,
            activity_type: 'custom_note',
            activity_category: 'note',
            title: (payload.title as string) ?? 'Note added',
            description: (payload.content as string) ?? undefined,
            metadata: buildActivityMetadata(mutation),
          });
          return { ok: true };
        }
        case 'add_reminder': {
          const reminder = toRecord(payload.reminder);
          const candidate = {
            entity_type: readString(reminder.entity_type),
            entity_id: readString(reminder.entity_id),
            reminder_datetime: readString(reminder.reminder_datetime),
            title: readString(reminder.title),
          };
          // Idempotent replay: an identical reminder already exists.
          if (await reminderExists(candidate)) return { ok: true };
          await addReminder(reminder as unknown as Parameters<typeof addReminder>[0]);
          return { ok: true };
        }
        case 'snooze_reminder': {
          await snoozeReminder(
            payload.reminderId as string,
            new Date(payload.snoozeUntil as string),
          );
          return { ok: true };
        }
        case 'done_reminder': {
          await dismissReminder(payload.reminderId as string);
          return { ok: true };
        }
        default:
          return { ok: false };
      }
    },
    [
      addLead,
      addReminder,
      addTask,
      creatorValue,
      dismissReminder,
      logActivity,
      snoozeReminder,
      updateLead,
      updateTask,
    ],
  );

  /**
   * The replay implementation is reached through a ref.
   *
   * `useReminders` returns new function identities on every render, so the
   * replay callback changes constantly. Keeping it behind a ref is what makes
   * the sync function below stable — and stability is what stops the idle
   * render → sync → render loop.
   */
  const applyMutationRef = useRef(applyMutation);
  applyMutationRef.current = applyMutation;

  /**
   * Replays the queue.
   *
   * The function is strictly stable: every value it needs is read from a ref
   * at call time. It performs at most ONE durable read per trigger and only
   * replays when there is something to replay.
   */
  const syncOutboxNow = useCallback(async (preloaded?: OutboxMutation[]): Promise<void> => {
    if (!mountedRef.current) return;
    if (syncInFlightRef.current) return;

    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    if (!online) return;

    syncInFlightRef.current = true;
    try {
      // ONE durable read per trigger.
      const queue = preloaded ?? (await loadOutbox(userIdRef.current));
      if (!mountedRef.current) return;

      const decision = shouldRunOutboxSync({
        isOnline: online,
        syncing: syncingRef.current,
        hasPendingWork: hasPendingOutboxWork(queue),
      });

      if (!decision) {
        // Nothing to replay: do not touch the queue and do not re-arm a timer
        // for work that does not exist.
        armRetryTimerRef.current(queue);
        return;
      }

      syncingRef.current = true;
      setIsSyncingOutbox(true);

      try {
        const remaining: OutboxMutation[] = [];

        for (const mutation of queue) {
          if (mutation.status === 'needs_review') {
            remaining.push(mutation);
            continue;
          }
          if (mutation.status === 'full') {
            // A refused mutation was never stored — there is nothing to replay.
            continue;
          }
          try {
            const result = await applyMutationRef.current(mutation);
            // A mutation that was already applied counts as SUCCESS: it is
            // removed from the queue, never retried.
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
        commitQueueRef.current(remaining);
        armRetryTimerRef.current(remaining);
      } finally {
        syncingRef.current = false;
        if (mountedRef.current) setIsSyncingOutbox(false);
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  const syncRef = useRef<(preloaded?: OutboxMutation[]) => Promise<void>>(syncOutboxNow);
  syncRef.current = syncOutboxNow;

  /* ------------------------------- triggers ------------------------------ */

  /**
   * Hydrates the queue and performs the first replay.
   *
   * The effect re-runs when the signed-in user changes: the queue of the
   * previous user is dropped, never reused.
   */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    // The previous user's queue must never be shown or replayed.
    outboxRef.current = [];
    setOutbox([]);

    void (async () => {
      const queue = await loadOutbox(userIdRef.current);
      if (cancelled || !mountedRef.current) return;
      outboxRef.current = queue;
      setOutbox(queue);
      // The first replay reuses the queue that was just read, so mounting
      // costs a single durable read.
      await syncRef.current?.(queue);
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [userId]);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const update = () => setIsOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  /** Trigger: the device regained its connection. */
  useEffect(() => {
    const onOnline = () => {
      void syncRef.current?.();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, []);

  /** Trigger: the app became visible again. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void syncRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        if (typeof window !== 'undefined') window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  /* ----------------------------- conflict UI ---------------------------- */

  const resolveOutboxConflict = useCallback(
    async (mutationId: string, resolution: OutboxConflictResolution) => {
      const queue = await loadOutbox(userIdRef.current);
      const target = queue.find((mutation) => mutation.id === mutationId);
      if (!target) return;

      if (resolution === 'merge_discard') {
        commitQueueRef.current(removeFromOutbox(queue, mutationId));
        return;
      }

      // `force_create`: apply the mutation even though a duplicate was detected.
      let applied = false;
      try {
        const result = await applyMutationRef.current({
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
      commitQueueRef.current(removeFromOutbox(queue, mutationId));
    },
    [],
  );

  const discardOutboxMutation = useCallback(
    async (mutationId: string) => {
      const queue = await loadOutbox(userIdRef.current);
      commitQueueRef.current(removeFromOutbox(queue, mutationId));
    },
    [],
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
// eslint-disable-next-line react-refresh/only-export-components
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
