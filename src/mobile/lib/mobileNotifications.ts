/**
 * Builds the mobile notification list from the live reminders table.
 *
 * The mobile workspace never invents notification content — every row is a
 * real reminder that the signed-in staff member can act on.
 */

import type { Reminder } from '@/hooks/useReminders';
import type { Customer, Lead, Professional } from '@/mobile/types/crmTypes';
import type { MobileRoute, NotificationItem } from '@/mobile/types/crmTypes';
import { formatShortDateTime } from '@/mobile/lib/format';

/** The live rows the notification body resolves its entity name from. */
export interface MobileNotificationLookups {
  leads: Lead[];
  customers: Customer[];
  professionals: Professional[];
}

function routeForReminder(reminder: Reminder): MobileRoute | undefined {
  switch (reminder.entity_type) {
    case 'lead':
      return {
        name: 'entity_profile',
        entityType: 'lead',
        entityId: reminder.entity_id,
        initialTab: 'overview',
      };
    case 'customer':
      return {
        name: 'entity_profile',
        entityType: 'customer',
        entityId: reminder.entity_id,
        initialTab: 'overview',
      };
    case 'professional':
      return {
        name: 'entity_profile',
        entityType: 'professional',
        entityId: reminder.entity_id,
        initialTab: 'overview',
      };
    case 'task':
      return { name: 'work' };
    default:
      return undefined;
  }
}

function entityNameForReminder(
  reminder: Reminder,
  lookups: MobileNotificationLookups,
): string {
  switch (reminder.entity_type) {
    case 'lead': {
      const lead = lookups.leads.find((item) => item.id === reminder.entity_id);
      return lead ? lead.full_name : 'Lead';
    }
    case 'customer': {
      const customer = lookups.customers.find((item) => item.id === reminder.entity_id);
      return customer ? customer.full_name : 'Customer';
    }
    case 'professional': {
      const professional = lookups.professionals.find((item) => item.id === reminder.entity_id);
      return professional ? professional.full_name : 'Professional';
    }
    default:
      return reminder.title;
  }
}

/**
 * The raw timestamp of a reminder, or `Infinity` when it has none.
 *
 * The list is sorted on this value — sorting the formatted `time_label`
 * compared strings such as "9 Nov · 9:00 AM" lexicographically, which put the
 * wrong reminder first.
 */
function reminderTimestamp(reminder: Reminder): number {
  if (!reminder.reminder_datetime) return Number.POSITIVE_INFINITY;
  const parsed = new Date(reminder.reminder_datetime).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Maps the live reminder rows into the mobile notification list.
 *
 * Dismissed reminders are excluded. The remaining reminders are ordered by
 * their raw `reminder_datetime` (oldest first), each with the entity it
 * belongs to so the user can jump straight to the record.
 */
export function buildMobileNotifications(
  reminders: Reminder[] | null | undefined,
  lookups: MobileNotificationLookups = { leads: [], customers: [], professionals: [] },
): NotificationItem[] {
  if (!Array.isArray(reminders)) return [];

  return reminders
    .filter((reminder) => !reminder.is_dismissed)
    .sort((a, b) => reminderTimestamp(a) - reminderTimestamp(b))
    .map((reminder) => ({
      id: `reminder-${reminder.id}`,
      title: reminder.title,
      body: entityNameForReminder(reminder, lookups),
      time_label: formatShortDateTime(reminder.reminder_datetime),
      category: 'reminder' as const,
      read: reminder.is_snoozed,
      target_route: routeForReminder(reminder),
    }));
}
