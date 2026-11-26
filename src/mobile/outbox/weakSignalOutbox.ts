/**
 * Weak-signal outbox.
 *
 * The mobile workspace must keep working on a flaky field connection, so every
 * mutation that cannot reach Supabase right now is parked in a durable queue
 * on the device and replayed later.
 *
 * Design rules:
 *  - Durable storage is IndexedDB (`mm_crm_outbox`); when IndexedDB is
 *    unavailable (private mode, old WebView) the queue falls back to
 *    localStorage under the same key.
 *  - The queue is scoped per signed-in user: the IndexedDB database name and
 *    the localStorage fallback key both carry the user id, so one field user
 *    can never replay another field user's queued work.
 *  - The queue is capped at {@link OUTBOX_MAX_ITEMS} entries. A full queue
 *    REFUSES new work instead of dropping the oldest entry — silent data loss
 *    is worse than an explicit refusal.
 *  - Replay uses an exponential backoff of 2s → 5s → 15s. Every queued item
 *    carries the absolute timestamp of its next attempt, and exactly one
 *    timer is armed for the earliest of them.
 *  - Every mutation carries a `client_mutation_id`. A mutation whose id is
 *    already queued is ignored, so a double tap can never double-apply.
 *  - A replay is idempotent: the database is checked before the write, so a
 *    retry after a dropped response never duplicates the row.
 *  - A mutation that collides with an existing record (for example a second
 *    lead with the same phone number) is parked as `needs_review` instead of
 *    being silently dropped or overwriting the live record.
 *
 * The pure helpers are exported separately so they can be unit tested without a
 * browser environment.
 */

import { normalizePhone10 } from '@/lib/phone';
import type { OutboxMutation, OutboxMutationKind } from '@/mobile/types/crmTypes';

export const OUTBOX_MAX_ITEMS = 50;
export const OUTBOX_BACKOFF_MS = [2000, 5000, 15000] as const;
export const OUTBOX_DB_NAME = 'mm_crm_outbox';
export const OUTBOX_DB_VERSION = 1;
export const OUTBOX_STORE_NAME = 'mm_outbox_v1';
export const OUTBOX_LOCAL_STORAGE_KEY = 'mm_outbox_v1';

/** Scope suffix used when no signed-in user is known. */
export const OUTBOX_ANONYMOUS_SCOPE = 'anonymous';

/**
 * Toast shown when the queue is full and the new mutation is refused.
 *
 * The wording is fixed: the field user has to understand that the device is
 * holding 50 unsynced mutations and that reconnecting is the way out.
 */
export const OUTBOX_FULL_MESSAGE =
  'Outbox is full (50/50). Reconnect to sync before adding more.';

/**
 * Window used to recognise a `create_lead` that was already applied.
 *
 * A replay after a dropped network response happens within seconds, so a ten
 * minute window is generous enough to catch it and short enough to never
 * suppress a genuinely new lead.
 */
export const OUTBOX_LEAD_REPLAY_WINDOW_MS = 10 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Narrows an unknown value to a plain object without `any`. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Sanitises a user id into a storage-scope suffix.
 *
 * Every character outside `[A-Za-z0-9_-]` becomes `_`, so a user id can never
 * inject a separator into a storage key. A missing user id maps to the
 * dedicated anonymous scope — never to another user's scope.
 */
export function sanitizeUserScope(userId?: string | null): string {
  const raw = typeof userId === 'string' ? userId.trim() : '';
  if (!raw) return OUTBOX_ANONYMOUS_SCOPE;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned || OUTBOX_ANONYMOUS_SCOPE;
}

/** IndexedDB database name holding the outbox of one signed-in user. */
export function outboxDbNameForUser(userId?: string | null): string {
  return `${OUTBOX_DB_NAME}_${sanitizeUserScope(userId)}`;
}

/** localStorage key mirroring the outbox of one signed-in user. */
export function outboxStorageKeyForUser(userId?: string | null): string {
  return `${OUTBOX_LOCAL_STORAGE_KEY}_${sanitizeUserScope(userId)}`;
}

/**
 * Appends a mutation to the queue, enforcing the FIFO cap.
 *
 * When the queue is full the oldest entry is discarded so the newest field
 * work is never lost.
 *
 * @deprecated Prefer {@link appendToOutboxOrRefuse}: dropping the oldest
 * entry loses field work without telling anybody.
 */
export function appendToOutboxCapped(
  queue: OutboxMutation[],
  item: OutboxMutation,
  maxItems: number = OUTBOX_MAX_ITEMS,
): OutboxMutation[] {
  const next = [...queue, item];
  if (next.length > maxItems) {
    return next.slice(next.length - maxItems);
  }
  return next;
}

/**
 * True when one more mutation still fits into the queue.
 *
 * A full queue refuses new work instead of dropping the oldest entry.
 */
export function canAcceptOutboxItem(
  queue: OutboxMutation[],
  maxItems: number = OUTBOX_MAX_ITEMS,
): boolean {
  return (queue ?? []).length < maxItems;
}

/**
 * Appends a mutation, or refuses it when the queue is full.
 *
 * On refusal the queue is returned untouched — the oldest entry is NOT
 * dropped — and `refused` is `true` so the caller can tell the field user
 * that the work was not stored.
 */
export function appendToOutboxOrRefuse(
  queue: OutboxMutation[],
  item: OutboxMutation,
  maxItems: number = OUTBOX_MAX_ITEMS,
): { queue: OutboxMutation[]; refused: boolean } {
  const current = queue ?? [];
  if (!canAcceptOutboxItem(current, maxItems)) {
    return { queue: current, refused: true };
  }
  return { queue: [...current, item], refused: false };
}

/**
 * Idempotency guard.
 *
 * Returns `true` when a mutation with the same `client_mutation_id` is
 * already present in the queue.
 */
export function hasClientMutationId(
  queue: OutboxMutation[],
  clientMutationId: string | undefined | null,
): boolean {
  if (!clientMutationId) return false;
  return (queue ?? []).some(
    (existing) => existing.client_mutation_id === clientMutationId,
  );
}

/**
 * Idempotency guard that also appends.
 *
 * Returns the queue unchanged when a mutation with the same
 * `client_mutation_id` is already present, and a **new** array with the
 * mutation appended otherwise.
 */
export function dedupeByClientMutationId(
  queue: OutboxMutation[],
  item: OutboxMutation,
): OutboxMutation[] {
  if (!item.client_mutation_id) return [...queue, item];
  if (hasClientMutationId(queue, item.client_mutation_id)) return queue;
  return [...queue, item];
}

/**
 * Returns the backoff delay for a given attempt number.
 * Attempt 1 → 2s, attempt 2 → 5s, attempt 3+ → 15s.
 */
export function nextBackoffMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt <= 1) return OUTBOX_BACKOFF_MS[0];
  if (attempt === 2) return OUTBOX_BACKOFF_MS[1];
  return OUTBOX_BACKOFF_MS[2];
}

/** Conflict resolutions a field user can pick from the outbox drawer. */
export type OutboxConflictResolution = 'merge_discard' | 'force_create';

/**
 * Reads the phone number out of a queued lead mutation payload.
 *
 * The mobile producers use three different shapes and they must agree with
 * `applyMutation`:
 *  - `create_lead` → `payload.lead.phone`
 *  - `update_lead` → `payload.updates.phone`
 *  - flat payloads → `payload.phone`
 */
export function readMutationPhone(
  payload: Record<string, unknown> | null | undefined,
): string {
  const source = asRecord(payload);
  const candidates = [
    asRecord(source.lead).phone,
    asRecord(source.updates).phone,
    source.phone,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return '';
}

/**
 * True when the mutation was explicitly forced past the duplicate check.
 */
export function isForceSavedMutation(mutation: OutboxMutation): boolean {
  const payload = asRecord(mutation?.payload);
  return payload.forceSave === true || asRecord(payload.lead).forceSave === true;
}

/**
 * Detects a duplicate-phone conflict for a queued lead mutation.
 *
 * `existingPhones` is the set of phone numbers already present in the live
 * table. Returns a human readable conflict message, or `null` when the
 * mutation can be applied safely.
 */
export function detectDuplicatePhoneConflict(
  mutation: OutboxMutation,
  existingPhones: ReadonlySet<string>,
): string | null {
  if (!existingPhones || existingPhones.size === 0) return null;
  if (mutation.kind !== 'create_lead' && mutation.kind !== 'update_lead') return null;
  // A forced save is the user explicitly asking to keep the record.
  if (isForceSavedMutation(mutation)) return null;

  const rawPhone = readMutationPhone(mutation.payload);
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const phone10 = digits.slice(-10);
  if (!existingPhones.has(phone10)) return null;

  return `Another record already uses this phone number (${phone10}). Review before saving.`;
}

/** Marks a mutation as needing manual review. */
export function markNeedsReview(
  mutation: OutboxMutation,
  conflictMessage: string,
): OutboxMutation {
  return {
    ...mutation,
    status: 'needs_review',
    conflictMessage,
    nextAttemptAt: null,
  };
}

/**
 * Increments the attempt counter after a failed replay and schedules the next
 * attempt with the exponential backoff.
 *
 * The absolute timestamp of the next attempt is stored on the mutation so the
 * scheduler can arm exactly one timer for the earliest pending item.
 */
export function withIncrementedAttempt(
  mutation: OutboxMutation,
  nowMs: number = Date.now(),
): OutboxMutation {
  const attempts = (mutation.attempts ?? 0) + 1;
  return {
    ...mutation,
    attempts,
    nextAttemptAt: nowMs + nextBackoffMs(attempts),
  };
}

/**
 * Schedules a fresh mutation for its first attempt.
 *
 * The item is due after the first backoff step so the scheduler can arm a
 * single timer for it.
 */
export function withNextAttempt(
  mutation: OutboxMutation,
  nowMs: number = Date.now(),
): OutboxMutation {
  return {
    ...mutation,
    nextAttemptAt: nowMs + nextBackoffMs((mutation.attempts ?? 0) + 1),
  };
}

/**
 * True when the queue still holds work the replay can act on.
 *
 * Parked conflicts (`needs_review`) and refused items (`full`) are waiting for
 * a human, so they are not pending work.
 */
export function hasPendingOutboxWork(queue: OutboxMutation[]): boolean {
  return (queue ?? []).some(
    (mutation) =>
      !!mutation && mutation.status !== 'needs_review' && mutation.status !== 'full',
  );
}

/**
 * Earliest absolute timestamp at which the queue wants to be replayed.
 *
 * Only timestamps still in the future count: an item whose turn already came
 * is retried by the trigger that is running right now, not by a timer.
 * Returns `null` when there is nothing to retry.
 */
export function computeNextAttemptAt(
  queue: OutboxMutation[],
  nowMs: number = Date.now(),
): number | null {
  let earliest: number | null = null;
  (queue ?? []).forEach((mutation) => {
    if (!mutation) return;
    if (mutation.status === 'needs_review' || mutation.status === 'full') return;
    const next = mutation.nextAttemptAt;
    if (typeof next !== 'number' || !Number.isFinite(next)) return;
    if (next <= nowMs) return;
    if (earliest === null || next < earliest) earliest = next;
  });
  return earliest;
}

/**
 * Guard deciding whether a trigger actually performs a sync.
 *
 * A trigger only reads the durable queue when it can do something with it:
 * the device must be online, no other sync may be running, and the queue must
 * hold work. This is what keeps an idle app from looping over storage.
 */
export function shouldRunOutboxSync(state: {
  isOnline: boolean;
  syncing: boolean;
  hasPendingWork: boolean;
}): boolean {
  if (!state || typeof state !== 'object') return false;
  if (state.isOnline !== true) return false;
  if (state.syncing === true) return false;
  return state.hasPendingWork === true;
}

/**
 * Builds a queued mutation with a stable `client_mutation_id`.
 *
 * The id is derived from the caller supplied `clientMutationId` when present,
 * otherwise a random one is generated. Re-submitting the same logical action
 * with the same id is a no-op.
 */
export function buildOutboxMutation(input: {
  clientMutationId?: string;
  kind: OutboxMutationKind;
  label: string;
  payload: Record<string, unknown>;
  now?: Date;
}): OutboxMutation {
  const createdAt = (input.now ?? new Date()).toISOString();
  const clientMutationId =
    input.clientMutationId ??
    `${input.kind}-${createdAt}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: clientMutationId,
    client_mutation_id: clientMutationId,
    kind: input.kind,
    label: input.label,
    payload: input.payload,
    createdAt,
    status: 'queued',
    attempts: 0,
  };
}

/**
 * Splits the queue into the mutations that can be replayed right now and the
 * ones that are waiting for a human decision.
 */
export function partitionOutbox(queue: OutboxMutation[]): {
  replayable: OutboxMutation[];
  needsReview: OutboxMutation[];
} {
  const replayable: OutboxMutation[] = [];
  const needsReview: OutboxMutation[] = [];
  (queue ?? []).forEach((mutation) => {
    if (mutation.status === 'needs_review') {
      needsReview.push(mutation);
    } else {
      replayable.push(mutation);
    }
  });
  return { replayable, needsReview };
}

/** Removes a mutation from the queue by id. */
export function removeFromOutbox(
  queue: OutboxMutation[],
  mutationId: string,
): OutboxMutation[] {
  return (queue ?? []).filter((mutation) => mutation.id !== mutationId);
}

/* -------------------------------------------------------------------------- */
/* Idempotent replay                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Metadata written on the `activity_log` row of a queued note or call.
 *
 * The `client_mutation_id` is the idempotency key: before replaying, the
 * database is asked whether a row with that key already exists. A dropped
 * network response therefore never duplicates the row.
 */
export function buildActivityMetadata(mutation: OutboxMutation): Record<string, unknown> {
  const payload = asRecord(mutation?.payload);
  const base = asRecord(payload.metadata);
  const metadata: Record<string, unknown> = { ...base };

  const clientMutationId = mutation?.client_mutation_id || mutation?.id || null;
  if (clientMutationId) metadata.client_mutation_id = clientMutationId;
  if (payload.outcome !== undefined) metadata.outcome = payload.outcome;

  return metadata;
}

/**
 * True when a live lead is the one this replay would create again.
 *
 * Same normalised phone, same owner and created inside the replay window
 * means the first attempt already landed and only the response was lost.
 */
export function isDuplicateLeadForReplay(
  lead: { phone?: string | null; created_by?: string | null; created_at?: string | null },
  phone: string,
  createdBy: string,
  nowMs: number = Date.now(),
): boolean {
  if (!lead) return false;

  const leadPhone = normalizePhone10(lead.phone ?? null);
  const targetPhone = normalizePhone10(phone ?? null);
  if (!leadPhone || !targetPhone || leadPhone !== targetPhone) return false;

  const leadOwner = (lead.created_by ?? '').trim().toLowerCase();
  const owner = (createdBy ?? '').trim().toLowerCase();
  if (!leadOwner || !owner || leadOwner !== owner) return false;

  const createdAt = Date.parse(lead.created_at ?? '');
  if (!Number.isFinite(createdAt)) return false;

  const age = nowMs - createdAt;
  // A row from the future is clock skew, not our own replay.
  if (age < -60_000) return false;
  return age < OUTBOX_LEAD_REPLAY_WINDOW_MS;
}

/**
 * True when an existing reminder is the one this replay would create again.
 *
 * The reminder tuple is `(entity_type, entity_id, reminder_datetime, title)`.
 */
export function isDuplicateReminderForReplay(
  existing: {
    entity_type?: string | null;
    entity_id?: string | null;
    reminder_datetime?: string | null;
    title?: string | null;
  },
  candidate: {
    entity_type?: string | null;
    entity_id?: string | null;
    reminder_datetime?: string | null;
    title?: string | null;
  },
): boolean {
  if (!existing || !candidate) return false;

  const sameEntityType =
    (existing.entity_type ?? '').trim() === (candidate.entity_type ?? '').trim();
  const sameEntityId = (existing.entity_id ?? '').trim() === (candidate.entity_id ?? '').trim();
  const sameTitle = (existing.title ?? '').trim() === (candidate.title ?? '').trim();
  if (!sameEntityType || !sameEntityId || !sameTitle) return false;

  return isSameInstant(existing.reminder_datetime, candidate.reminder_datetime);
}

/** True when two timestamps point at the same moment. */
function isSameInstant(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left === right;
  return a === b;
}

/* -------------------------------------------------------------------------- */
/* Durable storage                                                            */
/* -------------------------------------------------------------------------- */

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Session-scoped storage mode.
 *
 * `local` means IndexedDB could not be used (private mode, or another tab
 * holding the database open). Once that happens the whole session sticks to
 * localStorage: falling back *per call* would leave IndexedDB and
 * localStorage holding two different queues — a split brain that silently
 * drops queued field work.
 */
let storageMode: 'unknown' | 'idb' | 'local' = 'unknown';

function openOutboxDatabase(dbName: string): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    storageMode = 'local';
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, OUTBOX_DB_VERSION);
    } catch {
      storageMode = 'local';
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      storageMode = 'idb';
      resolve(request.result);
    };
    request.onerror = () => {
      storageMode = 'local';
      resolve(null);
    };
    request.onblocked = () => {
      // Another tab holds the database open. Falling back right now would
      // split the queue across two stores, so the session commits to
      // localStorage and never reads the stale IndexedDB copy again.
      storageMode = 'local';
      resolve(null);
    };
  });
}

function readFromLocalStorage(key: string): OutboxMutation[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxMutation[]) : [];
  } catch {
    return [];
  }
}

function writeToLocalStorage(queue: OutboxMutation[], key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(queue));
  } catch {
    /* quota exceeded — the in-memory queue still works for this session */
  }
}

/** Removes the localStorage mirror once IndexedDB is authoritative again. */
function clearLocalStorageCopy(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * Deletes every trace of one user's outbox from the device.
 *
 * Called on sign-out: the queued mutations of that user carry lead names,
 * phone numbers and notes, so they must not survive the session.
 */
export function clearOutboxStorageForUser(userId?: string | null): void {
  const key = outboxStorageKeyForUser(userId);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }

  const dbName = outboxDbNameForUser(userId);
  try {
    if (hasIndexedDb()) {
      // Fire and forget: the database is closed after every operation, so the
      // delete is normally not blocked.
      indexedDB.deleteDatabase(dbName);
    }
  } catch {
    /* delete unsupported — the localStorage mirror is already gone */
  }
}

/**
 * Merges two queue snapshots into one, newest-id-wins per entry.
 *
 * Used to converge IndexedDB and localStorage so a blocked database never
 * strands queued mutations in the store that is no longer read.
 */
export function mergeOutboxQueues(
  primary: OutboxMutation[],
  secondary: OutboxMutation[],
): OutboxMutation[] {
  const merged = new Map<string, OutboxMutation>();
  (secondary ?? []).forEach((mutation) => {
    if (mutation?.id) merged.set(mutation.id, mutation);
  });
  (primary ?? []).forEach((mutation) => {
    if (mutation?.id) merged.set(mutation.id, mutation);
  });
  return [...merged.values()].sort((a, b) =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  );
}

/**
 * Reads the persisted queue of one user, preferring IndexedDB and falling
 * back to localStorage.
 *
 * The queue of one user is never returned for another user: both the database
 * name and the localStorage key carry the user scope.
 */
export async function loadOutbox(userId?: string | null): Promise<OutboxMutation[]> {
  const storageKey = outboxStorageKeyForUser(userId);

  // The session already committed to localStorage — never read the stale
  // IndexedDB copy again.
  if (storageMode === 'local') return readFromLocalStorage(storageKey);

  const db = await openOutboxDatabase(outboxDbNameForUser(userId));
  if (!db) return readFromLocalStorage(storageKey);

  return new Promise((resolve) => {
    let request: IDBRequest;
    try {
      request = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME).getAll();
    } catch {
      db.close();
      resolve(readFromLocalStorage(storageKey));
      return;
    }
    request.onsuccess = () => {
      const rows = (request.result ?? []) as OutboxMutation[];
      const sorted = [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      db.close();
      // Converge both stores: anything only present in localStorage (written
      // while IndexedDB was blocked) must not be lost.
      resolve(mergeOutboxQueues(sorted, readFromLocalStorage(storageKey)));
    };
    request.onerror = () => {
      db.close();
      resolve(readFromLocalStorage(storageKey));
    };
  });
}

/** Persists the queue of one user. Never throws. */
export async function saveOutbox(
  queue: OutboxMutation[],
  userId?: string | null,
): Promise<void> {
  const storageKey = outboxStorageKeyForUser(userId);

  if (storageMode === 'local') {
    writeToLocalStorage(queue, storageKey);
    return;
  }

  const db = await openOutboxDatabase(outboxDbNameForUser(userId));
  if (!db) {
    writeToLocalStorage(queue, storageKey);
    return;
  }

  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    } catch {
      db.close();
      writeToLocalStorage(queue, storageKey);
      resolve();
      return;
    }
    const store = transaction.objectStore(OUTBOX_STORE_NAME);
    try {
      store.clear();
      queue.forEach((mutation) => {
        store.put(mutation);
      });
    } catch {
      /* fall through to the transaction's error handler */
    }
    transaction.oncomplete = () => {
      db.close();
      // IndexedDB is the source of truth now — drop the localStorage copy so
      // the two stores can never disagree.
      clearLocalStorageCopy(storageKey);
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      writeToLocalStorage(queue, storageKey);
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      writeToLocalStorage(queue, storageKey);
      resolve();
    };
  });
}
