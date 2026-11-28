import { describe, expect, it } from 'vitest';

import type { Reminder } from '@/hooks/useReminders';
import type { Task } from '@/hooks/useTasks';
import type { Customer, Lead, Professional } from '@/mobile/types/crmTypes';
import {
  countDueUnclearedReminders,
  isReminderDueAndUncleared,
  partitionRemindersForBell,
} from '@/lib/reminderBellState';
import { resolveReminderTarget } from '@/mobile/lib/mobileNotifications';
import { collectNewlyDueAlertReminders } from '@/mobile/lib/notificationAlerts';

const NOW = Date.parse('2026-11-28T11:00:00.000Z');

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Call back',
    description: null,
    reminder_datetime: '2026-11-28T08:00:00.000Z',
    is_dismissed: false,
    is_snoozed: false,
    snooze_until: null,
    entity_type: 'lead',
    entity_id: 'l1',
    is_recurring: false,
    recurrence_pattern: null,
    recurrence_end_date: null,
    created_by: 'staff',
    assigned_to: 'Staff',
    created_at: '2026-11-28T07:00:00.000Z',
    updated_at: '2026-11-28T07:00:00.000Z',
    ...overrides,
  };
}

const lead = { id: 'l1', full_name: 'Aarav Mehta', designation: 'Homeowner' } as Lead;
const customer = { id: 'c1', full_name: 'Nikhil Shah' } as Customer;
const professional = {
  id: 'p1',
  full_name: 'Riya Architects',
  professional_type: 'architect',
} as Professional;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Share quartz samples',
    lead_id: 'l1',
    related_entity_type: null,
    related_entity_id: null,
    lead: { id: 'l1', name: 'Aarav Mehta', phone: '9999999999' },
    ...overrides,
  } as Task;
}

describe('reminder bell state', () => {
  const clearedAt = '2026-11-28T10:00:00.000Z';

  it('keeps cleared overdue reminders active without counting them as New', () => {
    const oldOverdue = reminder();
    expect(isReminderDueAndUncleared(oldOverdue, clearedAt, NOW)).toBe(false);
    const partition = partitionRemindersForBell([oldOverdue], clearedAt, NOW);
    expect(partition.newDue).toHaveLength(0);
    expect(partition.active).toEqual([oldOverdue]);
    expect(countDueUnclearedReminders([oldOverdue], clearedAt, NOW)).toBe(0);
  });

  it('keeps future reminders out of New', () => {
    const future = reminder({ reminder_datetime: '2026-11-28T12:00:00.000Z' });
    expect(isReminderDueAndUncleared(future, clearedAt, NOW)).toBe(false);
    expect(partitionRemindersForBell([future], clearedAt, NOW).active).toEqual([future]);
  });

  it('re-enters New when a snooze expires after the clear timestamp', () => {
    const expiredSnooze = reminder({
      is_snoozed: true,
      snooze_until: '2026-11-28T10:30:00.000Z',
    });
    expect(isReminderDueAndUncleared(expiredSnooze, clearedAt, NOW)).toBe(true);
    expect(partitionRemindersForBell([expiredSnooze], clearedAt, NOW).newDue).toEqual([expiredSnooze]);
  });

  it('re-enters New when an overdue reminder was created after the clear timestamp', () => {
    const newlyCreated = reminder({ created_at: '2026-11-28T10:30:00.000Z' });
    expect(isReminderDueAndUncleared(newlyCreated, clearedAt, NOW)).toBe(true);
    expect(partitionRemindersForBell([newlyCreated], clearedAt, NOW).newDue).toEqual([newlyCreated]);
  });

  it('excludes dismissed reminders from both New and Active Reminders', () => {
    const dismissed = reminder({ is_dismissed: true });
    const partition = partitionRemindersForBell([dismissed], null, NOW);
    expect(partition.newDue).toHaveLength(0);
    expect(partition.active).toHaveLength(0);
  });

  it('counts an expired snooze and a new overdue reminder, but not an old or future reminder', () => {
    expect(
      countDueUnclearedReminders(
        [
          reminder({ id: 'old' }),
          reminder({ id: 'future', reminder_datetime: '2026-11-28T12:00:00.000Z' }),
          reminder({ id: 'snooze', is_snoozed: true, snooze_until: '2026-11-28T10:30:00.000Z' }),
          reminder({ id: 'new', created_at: '2026-11-28T10:30:00.000Z' }),
          reminder({ id: 'dismissed', is_dismissed: true }),
        ],
        clearedAt,
        NOW,
      ),
    ).toBe(2);
  });
});

describe('reminder target resolution', () => {
  const lookups = {
    leads: [lead],
    customers: [customer],
    professionals: [professional],
    tasks: [
      task(),
      task({
        id: 't-customer',
        lead_id: null,
        related_entity_type: 'customer',
        related_entity_id: 'c1',
      }),
      task({
        id: 't-professional',
        lead_id: null,
        related_entity_type: 'professional',
        related_entity_id: 'p1',
      }),
    ],
  };

  it('opens the actual task while showing its linked lead', () => {
    const target = resolveReminderTarget(
      reminder({ entity_type: 'task', entity_id: 't1' }),
      lookups,
    );
    expect(target.entityName).toBe('Aarav Mehta');
    expect(target.route).toEqual({ name: 'work', taskId: 't1' });
    expect(target.taskId).toBe('t1');
  });

  it('resolves a task linked to a customer or professional', () => {
    expect(
      resolveReminderTarget(reminder({ entity_type: 'task', entity_id: 't-customer' }), lookups)
        .entityName,
    ).toBe('Nikhil Shah');
    expect(
      resolveReminderTarget(reminder({ entity_type: 'task', entity_id: 't-professional' }), lookups)
        .entityName,
    ).toBe('Riya Architects');
  });

  it('routes lead, customer and professional reminders to their profiles', () => {
    expect(resolveReminderTarget(reminder(), lookups).route).toEqual({
      name: 'entity_profile',
      entityType: 'lead',
      entityId: 'l1',
      initialTab: 'overview',
    });
    expect(
      resolveReminderTarget(reminder({ entity_type: 'customer', entity_id: 'c1' }), lookups).route,
    ).toEqual({
      name: 'entity_profile',
      entityType: 'customer',
      entityId: 'c1',
      initialTab: 'overview',
    });
    expect(
      resolveReminderTarget(reminder({ entity_type: 'professional', entity_id: 'p1' }), lookups)
        .route,
    ).toEqual({
      name: 'entity_profile',
      entityType: 'professional',
      entityId: 'p1',
      initialTab: 'overview',
    });
  });

  it('falls back to the Work list when the linked task is unavailable', () => {
    expect(
      resolveReminderTarget(reminder({ entity_type: 'task', entity_id: 'missing-task' }), lookups)
        .route,
    ).toEqual({ name: 'work' });
  });
});

describe('newly due alert collection', () => {
  it('seeds the initial load silently, then alerts only once per trigger key', () => {
    const alertedKeys = new Set<string>();
    const initiallyDue = [reminder()];
    expect(collectNewlyDueAlertReminders(initiallyDue, alertedKeys, false)).toEqual([]);
    expect(alertedKeys.size).toBe(1);
    expect(collectNewlyDueAlertReminders(initiallyDue, alertedKeys, true)).toEqual([]);

    const newlyDue = reminder({ id: 'r2' });
    expect(collectNewlyDueAlertReminders([newlyDue], alertedKeys, true)).toEqual([newlyDue]);
    expect(collectNewlyDueAlertReminders([newlyDue], alertedKeys, true)).toEqual([]);

    const snoozedAgain = reminder({
      id: 'r2',
      is_snoozed: true,
      snooze_until: '2026-11-28T10:45:00.000Z',
    });
    expect(collectNewlyDueAlertReminders([snoozedAgain], alertedKeys, true)).toEqual([
      snoozedAgain,
    ]);
  });
});
