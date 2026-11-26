/**
 * Weak-signal outbox.
 *
 * The mobile workspace must keep working on a flaky field connection, so every
 * mutation that cannot reach Supabase right now is parked in a durable queue
 * on the device and replayed later.
 *
 * Design rules:
 *  - Durable storage is IndexedDB (`mm_outbox_v1`); when IndexedDB is
 *    unavailable (private mode, old WebView) the queue falls back to
 *    localStorage under the same key.
 *  - The queue is capped at {@link OUTBOX_MAX_ITEMS} entries and is strictly
 *    FIFO: the oldest entry is dropped when the cap is exceeded.
 *  - Replay uses an exponential backoff of 2s → 5s → 15s.
 *  - Every mutation carries a `client_mutation_id`. A mutation whose id is
 *    already queued is ignored, so a double tap can never double-apply.
 *  - A mutation that collides with an existing record (for example a second
 *    lead with the same phone number) is parked as `needs_review` instead of
 *    being silently dropped or overwriting the live record.
 *
 * The pure helpers are exported separately so they can be unit tested without a
 * browser environment.
 */

import type { OutboxMutation, OutboxMutationKind } from '@/mobile/types/crmTypes';

export const OUTBOX_MAX_ITEMS = 50;
export const OUTBOX_BACKOFF_MS = [2000, 5000, 15000] as const;
export const OUTBOX_DB_NAME = 'mm_crm_outbox';
export const OUTBOX_DB_VERSION = 1;
export const OUTBOX_STORE_NAME = 'mm_outbox_v1';
export const OUTBOX_LOCAL_STORAGE_KEY = 'mm_outbox_v1';

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Appends a mutation to the queue, enforcing the FIFO cap.
 *
 * When the queue is full the oldest entry is discarded so the newest field
 * work is never lost.
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
  const source = (payload ?? {}) as Record<string, any>;
  const candidates = [source.lead?.phone, source.updates?.phone, source.phone];
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
  const payload = (mutation.payload ?? {}) as Record<string, any>;
  return payload.forceSave === true || payload.lead?.forceSave === true;
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
  };
}

/** Increments the attempt counter after a failed replay. */
export function withIncrementedAttempt(mutation: OutboxMutation): OutboxMutation {
  return {
    ...mutation,
    attempts: (mutation.attempts ?? 0) + 1,
  };
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

function openOutboxDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    storageMode = 'local';
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
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

function readFromLocalStorage(): OutboxMutation[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxMutation[]) : [];
  } catch {
    return [];
  }
}

function writeToLocalStorage(queue: OutboxMutation[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(OUTBOX_LOCAL_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* quota exceeded — the in-memory queue still works for this session */
  }
}

/** Removes the localStorage mirror once IndexedDB is authoritative again. */
function clearLocalStorageCopy(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(OUTBOX_LOCAL_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
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

/** Reads the persisted queue, preferring IndexedDB and falling back to localStorage. */
export async function loadOutbox(): Promise<OutboxMutation[]> {
  // The session already committed to localStorage — never read the stale
  // IndexedDB copy again.
  if (storageMode === 'local') return readFromLocalStorage();

  const db = await openOutboxDatabase();
  if (!db) return readFromLocalStorage();

  return new Promise((resolve) => {
    let request: IDBRequest;
    try {
      request = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME).getAll();
    } catch {
      db.close();
      resolve(readFromLocalStorage());
      return;
    }
    request.onsuccess = () => {
      const rows = (request.result ?? []) as OutboxMutation[];
      const sorted = [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      db.close();
      // Converge both stores: anything only present in localStorage (written
      // while IndexedDB was blocked) must not be lost.
      resolve(mergeOutboxQueues(sorted, readFromLocalStorage()));
    };
    request.onerror = () => {
      db.close();
      resolve(readFromLocalStorage());
    };
  });
}

/** Persists the queue. Never throws. */
export async function saveOutbox(queue: OutboxMutation[]): Promise<void> {
  if (storageMode === 'local') {
    writeToLocalStorage(queue);
    return;
  }

  const db = await openOutboxDatabase();
  if (!db) {
    writeToLocalStorage(queue);
    return;
  }

  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    } catch {
      db.close();
      writeToLocalStorage(queue);
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
      clearLocalStorageCopy();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      writeToLocalStorage(queue);
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      writeToLocalStorage(queue);
      resolve();
    };
  });
}
