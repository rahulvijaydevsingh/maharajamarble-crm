import { describe, expect, it } from 'vitest';

import {
  OUTBOX_BACKOFF_MS,
  OUTBOX_MAX_ITEMS,
  appendToOutboxCapped,
  buildOutboxMutation,
  dedupeByClientMutationId,
  detectDuplicatePhoneConflict,
  markNeedsReview,
  nextBackoffMs,
  partitionOutbox,
  removeFromOutbox,
  withIncrementedAttempt,
} from '@/mobile/outbox/weakSignalOutbox';
import type { OutboxMutation } from '@/mobile/types/crmTypes';

function mutation(index: number, overrides: Partial<OutboxMutation> = {}): OutboxMutation {
  return {
    id: `m-${index}`,
    client_mutation_id: `m-${index}`,
    kind: 'add_note',
    label: `Note ${index}`,
    payload: {},
    createdAt: new Date(1_700_000_000_000 + index).toISOString(),
    status: 'queued',
    attempts: 0,
    ...overrides,
  };
}

describe('outbox capacity and FIFO order', () => {
  it('caps the queue at 50 items', () => {
    expect(OUTBOX_MAX_ITEMS).toBe(50);
    let queue: OutboxMutation[] = [];
    for (let index = 0; index < 55; index += 1) {
      queue = appendToOutboxCapped(queue, mutation(index));
    }
    expect(queue).toHaveLength(50);
  });

  it('drops the oldest entries first so the newest field work survives', () => {
    let queue: OutboxMutation[] = [];
    for (let index = 0; index < 55; index += 1) {
      queue = appendToOutboxCapped(queue, mutation(index));
    }
    expect(queue[0].id).toBe('m-5');
    expect(queue[49].id).toBe('m-54');
  });

  it('keeps the queue in FIFO order', () => {
    let queue: OutboxMutation[] = [];
    for (let index = 0; index < 3; index += 1) {
      queue = appendToOutboxCapped(queue, mutation(index));
    }
    expect(queue.map((item) => item.id)).toEqual(['m-0', 'm-1', 'm-2']);
  });
});

describe('client_mutation_id idempotency', () => {
  it('ignores a mutation whose client_mutation_id is already queued', () => {
    const queue = [mutation(1)];
    const duplicate = mutation(2, { client_mutation_id: 'm-1' });
    const result = dedupeByClientMutationId(queue, duplicate);
    expect(result).toBe(queue);
    expect(result).toHaveLength(1);
  });

  it('keeps a mutation with a fresh client_mutation_id', () => {
    const queue = [mutation(1)];
    const fresh = mutation(2);
    const result = dedupeByClientMutationId(queue, fresh);
    expect(result).toHaveLength(1);
  });

  it('builds a mutation with a stable client_mutation_id', () => {
    const built = buildOutboxMutation({
      clientMutationId: 'stable-id',
      kind: 'create_lead',
      label: 'New lead',
      payload: { phone: '9829112233' },
    });
    expect(built.id).toBe('stable-id');
    expect(built.client_mutation_id).toBe('stable-id');
    expect(built.status).toBe('queued');
    expect(built.attempts).toBe(0);
  });

  it('generates a client_mutation_id when the caller does not supply one', () => {
    const built = buildOutboxMutation({
      kind: 'add_note',
      label: 'Note',
      payload: {},
    });
    expect(built.client_mutation_id.length).toBeGreaterThan(0);
  });
});

describe('exponential backoff', () => {
  it('uses 2s, then 5s, then 15s', () => {
    expect(OUTBOX_BACKOFF_MS).toEqual([2000, 5000, 15000]);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(5000);
    expect(nextBackoffMs(3)).toBe(15000);
  });

  it('stays at 15s for every further attempt', () => {
    expect(nextBackoffMs(4)).toBe(15000);
    expect(nextBackoffMs(99)).toBe(15000);
  });

  it('increments the attempt counter', () => {
    expect(withIncrementedAttempt(mutation(1)).attempts).toBe(1);
    expect(withIncrementedAttempt(withIncrementedAttempt(mutation(1))).attempts).toBe(2);
  });
});

describe('duplicate conflict routing', () => {
  it('detects a duplicate phone on a queued lead mutation', () => {
    const queued = mutation(1, {
      kind: 'create_lead',
      payload: { phone: '+91 98291 12233' },
    });
    const conflict = detectDuplicatePhoneConflict(queued, new Set(['9829112233']));
    expect(conflict).not.toBeNull();
    expect(conflict).toContain('9829112233');
  });

  it('does not flag a phone that is free', () => {
    const queued = mutation(1, {
      kind: 'create_lead',
      payload: { phone: '9829112233' },
    });
    expect(detectDuplicatePhoneConflict(queued, new Set(['9000000000']))).toBeNull();
    expect(detectDuplicatePhoneConflict(queued, new Set())).toBeNull();
  });

  it('does not flag mutations that are not lead writes', () => {
    const queued = mutation(1, { kind: 'add_note', payload: { phone: '9829112233' } });
    expect(detectDuplicatePhoneConflict(queued, new Set(['9829112233']))).toBeNull();
  });

  it('parks the mutation as needs_review instead of dropping it', () => {
    const queued = mutation(1, { kind: 'create_lead', payload: { phone: '9829112233' } });
    const parked = markNeedsReview(queued, 'Duplicate phone number');
    expect(parked.status).toBe('needs_review');
    expect(parked.conflictMessage).toBe('Duplicate phone number');
    expect(parked.id).toBe(queued.id);
  });

  it('partitions the queue into replayable and review items', () => {
    const queue = [
      mutation(1),
      markNeedsReview(mutation(2), 'conflict'),
      mutation(3, { status: 'syncing' }),
    ];
    const { replayable, needsReview } = partitionOutbox(queue);
    expect(replayable).toHaveLength(2);
    expect(needsReview).toHaveLength(1);
    expect(needsReview[0].id).toBe('m-2');
  });

  it('removes a resolved mutation from the queue', () => {
    const queue = [mutation(1), mutation(2)];
    expect(removeFromOutbox(queue, 'm-1').map((item) => item.id)).toEqual(['m-2']);
  });
});
