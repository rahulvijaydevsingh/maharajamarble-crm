import { describe, expect, it } from 'vitest';

import { normalizePhone10 } from '@/lib/phone';
import { isProfessionalDesignation } from '@/lib/professionalResolver';
import { buildWhatsAppUrl, buildTelUrl } from '@/mobile/lib/format';
import { isTaskActiveAndNotOrphan } from '@/mobile/lib/tasks';
import {
  isPendingCallValid,
  PENDING_CALL_TTL_MS,
} from '@/mobile/hooks/useCallIntentWatcher';
import {
  appendToOutboxCapped,
  buildOutboxMutation,
  OUTBOX_MAX_ITEMS,
} from '@/mobile/outbox/weakSignalOutbox';
import { taskTypeLabel } from '@/mobile/lib/tasks';
import type { CrmTask, OutboxMutation } from '@/mobile/types/crmTypes';

describe('normalizePhone10 strips country code and non-digits cleanly', () => {
  it('accepts the common Indian formats', () => {
    expect(normalizePhone10('+91 98291-12233')).toBe('9829112233');
    expect(normalizePhone10('09829112233')).toBe('9829112233');
    expect(normalizePhone10('9829112233')).toBe('9829112233');
    expect(normalizePhone10('00919829112233')).toBe('9829112233');
  });

  it('rejects numbers that are not valid Indian mobiles', () => {
    expect(normalizePhone10('1234567890')).toBeNull();
    expect(normalizePhone10('12345')).toBeNull();
    expect(normalizePhone10('')).toBeNull();
    expect(normalizePhone10(null)).toBeNull();
  });
});

describe('task type labels use the Control Panel value space', () => {
  it('resolves canonical snake_case free text to a readable label', () => {
    expect(taskTypeLabel('Follow-up Call')).toBe('Follow-up Call');
    expect(taskTypeLabel('Site Visit')).toBe('Site Visit');
    expect(taskTypeLabel('Sample Delivery')).toBe('Sample Delivery');
  });

  it('falls back to a generic label for an unknown value', () => {
    expect(taskTypeLabel(undefined)).toBe('Task');
    expect(taskTypeLabel(null)).toBe('Task');
  });
});

describe('isProfessionalDesignation identifies professional roles accurately', () => {
  it('recognises the canonical professional designations', () => {
    expect(isProfessionalDesignation('architect')).toBe(true);
    expect(isProfessionalDesignation('contractor')).toBe(true);
    expect(isProfessionalDesignation('builder')).toBe(true);
    expect(isProfessionalDesignation('interior_designer')).toBe(true);
  });

  it('does not treat an individual designation as professional', () => {
    expect(isProfessionalDesignation('owner')).toBe(false);
    expect(isProfessionalDesignation('homeowner')).toBe(false);
    expect(isProfessionalDesignation(null)).toBe(false);
  });
});

describe('isTaskActiveAndNotOrphan preserves customer and pro tasks while filtering deleted-lead orphans', () => {
  const base: Omit<
    CrmTask,
    'id' | 'lead_id' | 'lead' | 'customer_id' | 'professional_id' | 'is_deleted'
  > = {
    title: 'Sample task',
    task_type: 'Follow-up Call',
    due_at: new Date().toISOString(),
    status: 'Pending',
    is_recurring: false,
    reminder_enabled: true,
    assigned_to: 'Test Staff Member',
    created_by: 'Test Staff Member',
    updated_by: 'Test Staff Member',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('keeps a customer task (lead_id === null)', () => {
    expect(
      isTaskActiveAndNotOrphan({
        ...base,
        id: 't-cust',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
      }),
    ).toBe(true);
  });

  it('keeps a professional task (lead_id === null)', () => {
    expect(
      isTaskActiveAndNotOrphan({
        ...base,
        id: 't-pro',
        lead_id: null,
        lead: null,
        customer_id: null,
        professional_id: 'prof-1',
      }),
    ).toBe(true);
  });

  it('excludes an orphaned deleted-lead task', () => {
    expect(
      isTaskActiveAndNotOrphan({
        ...base,
        id: 't-orphan',
        lead_id: 'lead-deleted',
        lead: null,
        customer_id: null,
        professional_id: null,
      }),
    ).toBe(false);
  });

  it('excludes a soft-deleted task', () => {
    expect(
      isTaskActiveAndNotOrphan({
        ...base,
        id: 't-del',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
        is_deleted: true,
      }),
    ).toBe(false);
  });
});

describe('isPendingCallValid enforces the 30 minute TTL', () => {
  const now = 1_700_000_000_000;

  it('accepts a call that is still inside the window', () => {
    expect(
      isPendingCallValid(
        {
          entityType: 'lead',
          entityId: 'lead-1',
          entityName: 'Test',
          phone: '9829112233',
          startedAt: now - (PENDING_CALL_TTL_MS - 1000),
        },
        now,
      ),
    ).toBe(true);
  });

  it('expires a call that is older than 30 minutes', () => {
    expect(
      isPendingCallValid(
        {
          entityType: 'lead',
          entityId: 'lead-1',
          entityName: 'Test',
          phone: '9829112233',
          startedAt: now - (PENDING_CALL_TTL_MS + 1000),
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('appendToOutboxCapped caps the queue at 50 items', () => {
  it('keeps the newest 50 mutations in FIFO order', () => {
    let queue: OutboxMutation[] = [];
    for (let index = 0; index < 55; index += 1) {
      queue = appendToOutboxCapped(
        queue,
        buildOutboxMutation({
          clientMutationId: `m-${index}`,
          kind: 'add_note',
          label: `Note ${index}`,
          payload: {},
        }),
      );
    }
    expect(queue).toHaveLength(OUTBOX_MAX_ITEMS);
    expect(queue[0].id).toBe('m-5');
    expect(queue[49].id).toBe('m-54');
  });
});

describe('buildWhatsAppUrl opens a blank wa.me link without message templates', () => {
  it('never appends a text parameter', () => {
    const url = buildWhatsAppUrl('+91 98291 12233');
    expect(url).toBe('https://wa.me/919829112233');
    expect(url.includes('text=')).toBe(false);
  });

  it('builds a tel: deep link from the same number', () => {
    expect(buildTelUrl('+91 98291 12233')).toBe('tel:+919829112233');
  });
});
