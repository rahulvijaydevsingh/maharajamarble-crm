import type { Reminder } from '@/hooks/useReminders';

export interface SnoozePreset {
  label: string;
  shortLabel: string;
  getSnoozeUntil: (nowMs?: number) => Date;
}

/** Desktop currently exposes exactly one snooze action: one hour. */
export const REMINDER_SNOOZE_PRESETS: readonly SnoozePreset[] = [
  {
    label: '1 hour',
    shortLabel: '+1h',
    getSnoozeUntil: (nowMs = Date.now()) => new Date(nowMs + 60 * 60 * 1000),
  },
];

function parseIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** The timestamp at which this reminder most recently became due. */
export function getEffectiveReminderTriggerMs(
  reminder: Pick<Reminder, 'reminder_datetime' | 'is_snoozed' | 'snooze_until'>,
): number | null {
  if (reminder.is_snoozed && reminder.snooze_until) {
    const snoozeMs = parseIsoMs(reminder.snooze_until);
    if (snoozeMs !== null) return snoozeMs;
  }
  return parseIsoMs(reminder.reminder_datetime);
}

/**
 * A due reminder is new to the bell when it fired after the user's last clear,
 * or when it was created after that clear even if its scheduled time is older.
 */
export function isReminderDueAndUncleared(
  reminder: Pick<
    Reminder,
    'is_dismissed' | 'reminder_datetime' | 'is_snoozed' | 'snooze_until' | 'created_at'
  >,
  clearedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (reminder.is_dismissed) return false;
  const triggerMs = getEffectiveReminderTriggerMs(reminder);
  if (triggerMs === null || triggerMs > nowMs) return false;

  const clearedAtMs = parseIsoMs(clearedAtIso);
  if (clearedAtMs === null) return true;

  const createdMs = parseIsoMs(reminder.created_at) ?? 0;
  return Math.max(triggerMs, createdMs) > clearedAtMs;
}

export function getActiveReminders<
  T extends Pick<Reminder, 'is_dismissed' | 'reminder_datetime' | 'is_snoozed' | 'snooze_until'>,
>(reminders: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(reminders)) return [];
  return reminders
    .filter((reminder) => !reminder.is_dismissed)
    .sort((left, right) => {
      const leftMs = getEffectiveReminderTriggerMs(left) ?? Number.MAX_SAFE_INTEGER;
      const rightMs = getEffectiveReminderTriggerMs(right) ?? Number.MAX_SAFE_INTEGER;
      return leftMs - rightMs;
    });
}

export function partitionRemindersForBell<
  T extends Pick<
    Reminder,
    'is_dismissed' | 'reminder_datetime' | 'is_snoozed' | 'snooze_until' | 'created_at'
  >,
>(
  reminders: readonly T[] | null | undefined,
  clearedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): { newDue: T[]; active: T[] } {
  const active = getActiveReminders(reminders);
  const newDue = active
    .filter((reminder) => isReminderDueAndUncleared(reminder, clearedAtIso, nowMs))
    .sort((left, right) => {
      const leftMs = getEffectiveReminderTriggerMs(left) ?? 0;
      const rightMs = getEffectiveReminderTriggerMs(right) ?? 0;
      return rightMs - leftMs;
    });
  return { newDue, active };
}

export function countDueUnclearedReminders(
  reminders:
    | readonly Pick<
        Reminder,
        'is_dismissed' | 'reminder_datetime' | 'is_snoozed' | 'snooze_until' | 'created_at'
      >[]
    | null
    | undefined,
  clearedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  return partitionRemindersForBell(reminders, clearedAtIso, nowMs).newDue.length;
}

/** Changes when a reminder is snoozed to a different trigger timestamp. */
export function getReminderAlertKey(
  reminder: Pick<Reminder, 'id' | 'reminder_datetime' | 'is_snoozed' | 'snooze_until'>,
): string {
  const triggerMs = getEffectiveReminderTriggerMs(reminder) ?? 0;
  return `${reminder.id}:${triggerMs}`;
}
