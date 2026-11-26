import { describe, expect, it } from 'vitest';

import { buildMobileNotifications } from '@/mobile/lib/mobileNotifications';
import type { Reminder } from '@/hooks/useReminders';
import type { Customer, Lead, Professional } from '@/mobile/types/crmTypes';

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Call back',
    reminder_datetime: '2026-11-20T09:00:00.000Z',
    entity_type: 'lead',
    entity_id: 'l1',
    is_dismissed: false,
    is_snoozed: false,
    ...overrides,
  } as Reminder;
}

const lead = { id: 'l1', full_name: 'Aarav Mehta' } as Lead;
const customer = { id: 'c1', full_name: 'Nikhil Shah' } as Customer;
const professional = { id: 'p1', full_name: 'Riya Architects' } as Professional;

describe('mobile notifications', () => {
  it('sorts by the raw reminder timestamp, not by the formatted label', () => {
    // The label is a formatted string such as "9 Nov · 9:00 AM"; comparing
    // those lexicographically put the wrong reminder first.
    const notifications = buildMobileNotifications([
      reminder({ id: 'r2', reminder_datetime: '2026-11-09T09:00:00.000Z' }),
      reminder({ id: 'r1', reminder_datetime: '2026-11-20T09:00:00.000Z' }),
      reminder({ id: 'r3', reminder_datetime: '2026-12-01T09:00:00.000Z' }),
    ]);

    expect(notifications.map((item) => item.id)).toEqual([
      'reminder-r2',
      'reminder-r1',
      'reminder-r3',
    ]);
  });

  it('resolves the entity name from the lookups', () => {
    const notifications = buildMobileNotifications(
      [
        reminder({ id: 'r1', entity_type: 'lead', entity_id: 'l1' }),
        reminder({ id: 'r2', entity_type: 'customer', entity_id: 'c1' }),
        reminder({ id: 'r3', entity_type: 'professional', entity_id: 'p1' }),
      ],
      { leads: [lead], customers: [customer], professionals: [professional] },
    );

    expect(notifications.map((item) => item.body)).toEqual([
      'Aarav Mehta',
      'Nikhil Shah',
      'Riya Architects',
    ]);
  });

  it('falls back to a generic name for an unknown entity', () => {
    const notifications = buildMobileNotifications(
      [reminder({ entity_type: 'lead', entity_id: 'missing' })],
      { leads: [lead], customers: [], professionals: [] },
    );
    expect(notifications[0].body).toBe('Lead');
  });

  it('excludes a dismissed reminder', () => {
    const notifications = buildMobileNotifications([
      reminder({ id: 'r1' }),
      reminder({ id: 'r2', is_dismissed: true }),
    ]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('reminder-r1');
  });

  it('returns an empty list for a missing reminder list', () => {
    expect(buildMobileNotifications(null)).toEqual([]);
    expect(buildMobileNotifications(undefined)).toEqual([]);
  });

  it('keeps a reminder without a date at the end of the list', () => {
    const notifications = buildMobileNotifications([
      reminder({ id: 'r1', reminder_datetime: '' }),
      reminder({ id: 'r2', reminder_datetime: '2026-11-20T09:00:00.000Z' }),
    ]);
    expect(notifications.map((item) => item.id)).toEqual(['reminder-r2', 'reminder-r1']);
  });
});
