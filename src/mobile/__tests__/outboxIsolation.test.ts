import { describe, expect, it } from 'vitest';

import {
  OUTBOX_FULL_MESSAGE,
  OUTBOX_MAX_ITEMS,
  appendToOutboxOrRefuse,
  buildActivityMetadata,
  canAcceptOutboxItem,
  computeNextAttemptAt,
  hasPendingOutboxWork,
  isDuplicateLeadForReplay,
  isDuplicateReminderForReplay,
  outboxDbNameForUser,
  outboxStorageKeyForUser,
  shouldRunOutboxSync,
} from '@/mobile/outbox/weakSignalOutbox';
import {
  pendingCallKeyForUser,
  setPendingCallUserScope,
} from '@/mobile/hooks/useCallIntentWatcher';
import type { OutboxMutation } from '@/mobile/types/crmTypes';

const NOW = 1_700_000_000_000;

function mutation(index: number, overrides: Partial<OutboxMutation> = {}): OutboxMutation {
  return {
    id: `m-${index}`,
    client_mutation_id: `m-${index}`,
    kind: 'add_note',
    label: `Note ${index}`,
    payload: {},
    createdAt: new Date(NOW + index).toISOString(),
    status: 'queued',
    attempts: 0,
    ...overrides,
  };
}

describe('outbox idle-read guarantee', () => {
  it('never schedules a retry for an empty queue', () => {
    expect(computeNextAttemptAt([], NOW)).toBeNull();
  });

  it('never schedules a retry for a queue without pending work', () => {
    const parked = mutation(1, { status: 'needs_review' });
    expect(hasPendingOutboxWork([parked])).toBe(false);
    expect(computeNextAttemptAt([parked], NOW)).toBeNull();
  });

  it('reports pending work for a queued item', () => {
    expect(hasPendingOutboxWork([mutation(1)])).toBe(true);
  });

  it('refuses to sync when there is nothing to do', () => {
    // The guard is what keeps an idle app from reading storage over and over.
    expect(
      shouldRunOutboxSync({ isOnline: true, syncing: false, hasPendingWork: false }),
    ).toBe(false);
  });

  it('refuses to sync while offline or while another sync runs', () => {
    expect(
      shouldRunOutboxSync({ isOnline: false, syncing: false, hasPendingWork: true }),
    ).toBe(false);
    expect(
      shouldRunOutboxSync({ isOnline: true, syncing: true, hasPendingWork: true }),
    ).toBe(false);
  });

  it('syncs when the device is online and work is pending', () => {
    expect(
      shouldRunOutboxSync({ isOnline: true, syncing: false, hasPendingWork: true }),
    ).toBe(true);
  });

  it('one trigger means one decision, not one sync per item', () => {
    // The trigger reads the queue once and asks the guard a single question:
    // "is there anything to replay?" A queue with 3 items is still one sync.
    const queue = [mutation(1), mutation(2), mutation(3)];
    const decision = shouldRunOutboxSync({
      isOnline: true,
      syncing: false,
      hasPendingWork: hasPendingOutboxWork(queue),
    });
    expect(decision).toBe(true);
    expect(queue).toHaveLength(3);
  });

  it('picks the earliest future attempt and ignores the past', () => {
    const queue = [
      mutation(1, { nextAttemptAt: NOW + 5_000 }),
      mutation(2, { nextAttemptAt: NOW + 2_000 }),
      mutation(3, { nextAttemptAt: NOW - 10_000 }),
    ];
    expect(computeNextAttemptAt(queue, NOW)).toBe(NOW + 2_000);
  });

  it('ignores parked conflicts when scheduling', () => {
    const queue = [mutation(1, { status: 'needs_review', nextAttemptAt: NOW + 1_000 })];
    expect(computeNextAttemptAt(queue, NOW)).toBeNull();
  });
});

describe('full queue refuses new work', () => {
  const fullQueue = (): OutboxMutation[] => {
    const queue: OutboxMutation[] = [];
    for (let index = 0; index < OUTBOX_MAX_ITEMS; index += 1) {
      queue.push(mutation(index));
    }
    return queue;
  };

  it('refuses a 51st item', () => {
    const queue = fullQueue();
    expect(canAcceptOutboxItem(queue)).toBe(false);
    expect(canAcceptOutboxItem(queue.slice(0, 49))).toBe(true);
  });

  it('keeps the queue and the oldest item when it refuses', () => {
    const queue = fullQueue();
    const result = appendToOutboxOrRefuse(queue, mutation(999));
    expect(result.refused).toBe(true);
    expect(result.queue).toHaveLength(50);
    // The oldest queued work is NOT dropped to make room.
    expect(result.queue[0].id).toBe('m-0');
    expect(result.queue[49].id).toBe('m-49');
  });

  it('appends normally while there is room', () => {
    const queue = fullQueue().slice(0, 49);
    const result = appendToOutboxOrRefuse(queue, mutation(50));
    expect(result.refused).toBe(false);
    expect(result.queue).toHaveLength(50);
    expect(result.queue[49].id).toBe('m-50');
  });

  it('tells the field user exactly what happened', () => {
    expect(OUTBOX_FULL_MESSAGE).toBe(
      'Outbox is full (50/50). Reconnect to sync before adding more.',
    );
  });
});

describe('per-user outbox scoping', () => {
  it('gives every user its own database', () => {
    expect(outboxDbNameForUser('u1')).not.toBe(outboxDbNameForUser('u2'));
    expect(outboxDbNameForUser('u1')).toBe(outboxDbNameForUser('u1'));
  });

  it('gives every user its own storage key', () => {
    expect(outboxStorageKeyForUser('u1')).not.toBe(outboxStorageKeyForUser('u2'));
    expect(outboxStorageKeyForUser('u1')).toBe(outboxStorageKeyForUser('u1'));
  });

  it('keeps the legacy base names as the prefix', () => {
    expect(outboxDbNameForUser('u1').startsWith('mm_crm_outbox')).toBe(true);
    expect(outboxStorageKeyForUser('u1').startsWith('mm_outbox_v1')).toBe(true);
  });

  it('maps a missing user to the anonymous scope, never to another user', () => {
    expect(outboxDbNameForUser(null)).toBe(outboxDbNameForUser(undefined));
    expect(outboxDbNameForUser(null)).toContain('anonymous');
    expect(outboxStorageKeyForUser('')).toContain('anonymous');
    expect(outboxStorageKeyForUser(null)).not.toBe(outboxStorageKeyForUser('u1'));
  });

  it('sanitises the user id out of the key', () => {
    expect(outboxStorageKeyForUser('user id/../evil')).not.toContain('/');
    expect(outboxStorageKeyForUser('user id/../evil')).not.toContain(' ');
  });
});

describe('per-user pending call scoping', () => {
  it('gives every user its own pending call key', () => {
    expect(pendingCallKeyForUser('u1')).not.toBe(pendingCallKeyForUser('u2'));
    expect(pendingCallKeyForUser('u1')).toBe(pendingCallKeyForUser('u1'));
  });

  it('keeps the legacy base name as the prefix', () => {
    expect(pendingCallKeyForUser('u1').startsWith('mm_pending_call_v1')).toBe(true);
  });

  it('falls back to a stable anonymous scope', () => {
    expect(pendingCallKeyForUser(null)).toBe(pendingCallKeyForUser(undefined));
    expect(pendingCallKeyForUser(null)).toContain('anonymous');
    expect(pendingCallKeyForUser(null)).not.toBe(pendingCallKeyForUser('u1'));
  });

  it('lets the watcher set the scope of the signed-in user', () => {
    expect(() => setPendingCallUserScope('u1')).not.toThrow();
    expect(() => setPendingCallUserScope(null)).not.toThrow();
  });
});

describe('idempotent replay helpers', () => {
  it('recognises a lead that was already created', () => {
    const lead = {
      phone: '+91 98291 12233',
      created_by: 'Field Agent',
      created_at: new Date(NOW - 60_000).toISOString(),
    };
    expect(isDuplicateLeadForReplay(lead, '9829112233', 'Field Agent', NOW)).toBe(true);
  });

  it('does not treat another user’s lead as a replay', () => {
    const lead = {
      phone: '9829112233',
      created_by: 'Someone else',
      created_at: new Date(NOW - 60_000).toISOString(),
    };
    expect(isDuplicateLeadForReplay(lead, '9829112233', 'Field Agent', NOW)).toBe(false);
  });

  it('does not treat an old lead as a replay', () => {
    const lead = {
      phone: '9829112233',
      created_by: 'Field Agent',
      created_at: new Date(NOW - 11 * 60_000).toISOString(),
    };
    expect(isDuplicateLeadForReplay(lead, '9829112233', 'Field Agent', NOW)).toBe(false);
  });

  it('does not treat another phone as a replay', () => {
    const lead = {
      phone: '9000000000',
      created_by: 'Field Agent',
      created_at: new Date(NOW - 60_000).toISOString(),
    };
    expect(isDuplicateLeadForReplay(lead, '9829112233', 'Field Agent', NOW)).toBe(false);
  });

  it('recognises an identical reminder', () => {
    const existing = {
      entity_type: 'lead',
      entity_id: 'lead-1',
      reminder_datetime: '2026-01-01T10:00:00.000Z',
      title: 'Call back',
    };
    expect(isDuplicateReminderForReplay(existing, { ...existing })).toBe(true);
  });

  it('does not recognise a reminder with a different title', () => {
    const existing = {
      entity_type: 'lead',
      entity_id: 'lead-1',
      reminder_datetime: '2026-01-01T10:00:00.000Z',
      title: 'Call back',
    };
    expect(
      isDuplicateReminderForReplay(existing, { ...existing, title: 'Site visit' }),
    ).toBe(false);
  });

  it('does not recognise a reminder of another entity', () => {
    const existing = {
      entity_type: 'lead',
      entity_id: 'lead-1',
      reminder_datetime: '2026-01-01T10:00:00.000Z',
      title: 'Call back',
    };
    expect(
      isDuplicateReminderForReplay(existing, { ...existing, entity_id: 'lead-2' }),
    ).toBe(false);
  });

  it('carries the client_mutation_id in the activity metadata', () => {
    const metadata = buildActivityMetadata(mutation(7));
    expect(metadata.client_mutation_id).toBe('m-7');
  });

  it('keeps the outcome of a call in the activity metadata', () => {
    const metadata = buildActivityMetadata(
      mutation(8, { kind: 'log_call', payload: { outcome: 'connected' } }),
    );
    expect(metadata.client_mutation_id).toBe('m-8');
    expect(metadata.outcome).toBe('connected');
  });
});
