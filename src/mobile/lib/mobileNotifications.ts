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

type LeadMapper = (lead: any) => Lead;
type CustomerMapper = (customer: any) => Customer;
type ProfessionalMapper = (professional: any) => Professional;

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
  toLead: LeadMapper,
  toCustomer: CustomerMapper,
  toProfessional: ProfessionalMapper,
  lookups: {
    leads: Lead[];
    customers: Customer[];
    professionals: Professional[];
  },
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
 * Maps the live reminder rows into the mobile notification list.
 *
 * Dismissed reminders are excluded. Upcoming reminders are listed first, then
 * the rest, each with the entity it belongs to so the user can jump straight
 * to the record.
 */
export function buildMobileNotifications(
  reminders: Reminder[] | null | undefined,
  toLead: LeadMapper,
  toCustomer: CustomerMapper,
  toProfessional: ProfessionalMapper,
  lookups: { leads: Lead[]; customers: Customer[]; professionals: Professional[] } = {
    leads: [],
    customers: [],
    professionals: [],
  },
): NotificationItem[] {
  if (!Array.isArray(reminders)) return [];

  return reminders
    .filter((reminder) => !reminder.is_dismissed)
    .map((reminder) => ({
      id: `reminder-${reminder.id}`,
      title: reminder.title,
      body: entityNameForReminder(
        reminder,
        toLead,
        toCustomer,
        toProfessional,
        lookups,
      ),
      time_label: formatShortDateTime(reminder.reminder_datetime),
      category: 'reminder' as const,
      read: reminder.is_snoozed,
      target_route: routeForReminder(reminder),
    }))
    .sort((a, b) => a.time_label.localeCompare(b.time_label));
}
