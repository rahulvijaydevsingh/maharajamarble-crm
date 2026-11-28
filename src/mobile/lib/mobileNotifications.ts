/**
 * Builds the mobile notification list from the live reminders table.
 * Every row retains its source reminder and resolved navigation target.
 */

import type { Reminder } from '@/hooks/useReminders';
import type { Task } from '@/hooks/useTasks';
import type { Customer, EntityKind, Lead, MobileRoute, NotificationItem, Professional } from '@/mobile/types/crmTypes';
import { formatShortDateTime } from '@/mobile/lib/format';
import { getEffectiveReminderTriggerMs } from '@/lib/reminderBellState';

export interface MobileNotificationLookups {
  leads: Lead[];
  customers: Customer[];
  professionals: Professional[];
  tasks?: Task[];
  getOptionLabel?: (moduleName: string, fieldName: string, value: string) => string;
}

export interface ResolvedReminderTarget {
  entityName: string;
  entityRole: string;
  entityKind: EntityKind | null;
  route?: MobileRoute;
  taskId?: string;
}

export interface MobileNotificationEntry extends NotificationItem {
  reminder: Reminder;
  reminder_id: string;
  entity_name: string;
  entity_role: string;
  task_id?: string;
  is_due: boolean;
  is_snoozed: boolean;
  trigger_label: string;
}

function findDirectEntity(
  entityType: string,
  entityId: string,
  lookups: MobileNotificationLookups,
): Omit<ResolvedReminderTarget, 'route'> & { route: MobileRoute } | null {
  if (entityType === 'lead') {
    const lead = lookups.leads.find((item) => item.id === entityId);
    const professional = lead?.professional_id
      ? lookups.professionals.find((item) => item.id === lead.professional_id)
      : undefined;
    const designation = lead?.designation?.trim() ?? '';
    const role = professional?.professional_type
      ? lookups.getOptionLabel?.('professionals', 'professional_type', professional.professional_type) || professional.professional_type
      : designation
        ? lookups.getOptionLabel?.('leads', 'designation', designation) || designation
        : 'Homeowner';
    return {
      entityName: lead?.full_name || 'Lead',
      entityRole: role,
      entityKind: 'lead',
      route: { name: 'entity_profile', entityType: 'lead', entityId, initialTab: 'overview' },
    };
  }

  if (entityType === 'customer') {
    const customer = lookups.customers.find((item) => item.id === entityId);
    return {
      entityName: customer?.full_name || 'Customer',
      entityRole: 'Customer',
      entityKind: 'customer',
      route: { name: 'entity_profile', entityType: 'customer', entityId, initialTab: 'overview' },
    };
  }

  if (entityType === 'professional') {
    const professional = lookups.professionals.find((item) => item.id === entityId);
    const type = professional?.professional_type?.trim() ?? '';
    return {
      entityName: professional?.full_name || 'Professional',
      entityRole: type
        ? lookups.getOptionLabel?.('professionals', 'professional_type', type) || type
        : 'Professional',
      entityKind: 'professional',
      route: { name: 'entity_profile', entityType: 'professional', entityId, initialTab: 'overview' },
    };
  }

  return null;
}

/** Resolve direct profile reminders and task reminders to the task and its linked person. */
export function resolveReminderTarget(
  reminder: Reminder,
  lookups: MobileNotificationLookups,
): ResolvedReminderTarget {
  const direct = findDirectEntity(reminder.entity_type, reminder.entity_id, lookups);
  if (direct) return direct;

  if (reminder.entity_type !== 'task') {
    return {
      entityName: reminder.description?.trim() || reminder.title,
      entityRole: 'Follow-up',
      entityKind: null,
    };
  }

  const task = lookups.tasks?.find((item) => item.id === reminder.entity_id);
  if (!task) {
    return {
      entityName: reminder.description?.trim() || reminder.title || 'Task follow-up',
      entityRole: 'Follow-up',
      entityKind: null,
      route: { name: 'work' },
    };
  }

  const linkedType = task.lead_id ? 'lead' : task.related_entity_type;
  const linkedId = task.lead_id || task.related_entity_id || '';
  const linked = linkedId ? findDirectEntity(linkedType || '', linkedId, lookups) : null;

  return {
    entityName: linked?.entityName || task.lead?.name || task.title || 'Task follow-up',
    entityRole: linked?.entityRole || 'Follow-up',
    entityKind: linked?.entityKind || null,
    route: { name: 'work', taskId: task.id },
    taskId: task.id,
  };
}

/**
 * Dismissed reminders are excluded. Rows are ordered by their effective due
 * timestamp so an expired snooze is sorted by its re-fire time.
 */
export function buildMobileNotifications(
  reminders: Reminder[] | null | undefined,
  lookups: MobileNotificationLookups = { leads: [], customers: [], professionals: [] },
  nowMs: number = Date.now(),
): MobileNotificationEntry[] {
  if (!Array.isArray(reminders)) return [];

  return reminders
    .filter((reminder) => !reminder.is_dismissed)
    .sort((left, right) => {
      const leftMs = getEffectiveReminderTriggerMs(left) ?? Number.POSITIVE_INFINITY;
      const rightMs = getEffectiveReminderTriggerMs(right) ?? Number.POSITIVE_INFINITY;
      return leftMs - rightMs;
    })
    .map((reminder) => {
      const target = resolveReminderTarget(reminder, lookups);
      const triggerMs = getEffectiveReminderTriggerMs(reminder);
      const triggerIso = triggerMs === null ? reminder.reminder_datetime : new Date(triggerMs).toISOString();
      return {
        id: `reminder-${reminder.id}`,
        title: reminder.title,
        body: target.entityName,
        time_label: formatShortDateTime(triggerIso),
        category: 'reminder' as const,
        read: reminder.is_snoozed,
        target_route: target.route,
        reminder,
        reminder_id: reminder.id,
        entity_name: target.entityName,
        entity_role: target.entityRole,
        task_id: target.taskId,
        is_due: triggerMs !== null && triggerMs <= nowMs,
        is_snoozed: reminder.is_snoozed,
        trigger_label: formatShortDateTime(triggerIso),
      };
    });
}
