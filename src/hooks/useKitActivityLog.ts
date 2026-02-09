import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { KitEntityType, KitTouchMethod } from '@/constants/kitConstants';
import type { Json } from '@/integrations/supabase/types';

interface LogKitActivityParams {
  entityType: KitEntityType;
  entityId: string;
  entityName: string;
}

export function useKitActivityLog() {
  const { user } = useAuth();
  const userName = user?.email || 'System';

  const logActivity = async (
    params: LogKitActivityParams & {
      activityType: string;
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }
  ) => {
    const { entityType, entityId, activityType, title, description, metadata } = params;

    const insertData: {
      activity_type: string;
      activity_category: string;
      title: string;
      description: string | null;
      user_name: string;
      user_id: string | null;
      metadata: Json;
      related_entity_type: string;
      related_entity_id: string;
      lead_id?: string;
      customer_id?: string;
    } = {
      activity_type: activityType,
      activity_category: 'keep_in_touch',
      title,
      description: description || null,
      user_name: userName,
      user_id: user?.id || null,
      metadata: (metadata || {}) as Json,
      related_entity_type: entityType,
      related_entity_id: entityId,
    };

    if (entityType === 'lead') {
      insertData.lead_id = entityId;
    } else if (entityType === 'customer') {
      insertData.customer_id = entityId;
    }

    await supabase.from('activity_log').insert([insertData]);
  };

  const logKitActivated = async (
    params: LogKitActivityParams & { presetName: string; assignedTo: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_activated',
      title: `Keep in Touch activated with "${params.presetName}"`,
      description: `Assigned to ${params.assignedTo}`,
      metadata: { preset_name: params.presetName, assigned_to: params.assignedTo },
    });
  };

  const logTouchCompleted = async (
    params: LogKitActivityParams & {
      method: KitTouchMethod;
      outcome: string;
      outcomeNotes?: string;
    }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_completed',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch completed`,
      description: `Outcome: ${params.outcome}${params.outcomeNotes ? ` - ${params.outcomeNotes}` : ''}`,
      metadata: { method: params.method, outcome: params.outcome },
    });
  };

  const logTouchSkipped = async (
    params: LogKitActivityParams & { method: KitTouchMethod }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_skipped',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch skipped`,
      metadata: { method: params.method },
    });
  };

  const logTouchSnoozed = async (
    params: LogKitActivityParams & { method: KitTouchMethod; snoozeUntil: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_snoozed',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch snoozed`,
      description: `Snoozed until ${params.snoozeUntil}`,
      metadata: { method: params.method, snooze_until: params.snoozeUntil },
    });
  };

  const logTouchRescheduled = async (
    params: LogKitActivityParams & { method: KitTouchMethod; newDate: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_rescheduled',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch rescheduled`,
      description: `Rescheduled to ${params.newDate}`,
      metadata: { method: params.method, new_date: params.newDate },
    });
  };

  const logTouchReassigned = async (
    params: LogKitActivityParams & { method: KitTouchMethod; newAssignee: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_reassigned',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch reassigned`,
      description: `Reassigned to ${params.newAssignee}`,
      metadata: { method: params.method, new_assignee: params.newAssignee },
    });
  };

  const logCycleCompleted = async (
    params: LogKitActivityParams & { cycleNumber: number; action: 'repeated' | 'stopped' }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_cycle_completed',
      title: `KIT cycle ${params.cycleNumber} completed`,
      description: params.action === 'repeated' ? 'Starting new cycle' : 'Subscription stopped',
      metadata: { cycle_number: params.cycleNumber, action: params.action },
    });
  };

  const logKitPaused = async (
    params: LogKitActivityParams & { pauseReason?: string; pauseUntil?: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_paused',
      title: 'Keep in Touch paused',
      description: params.pauseReason || (params.pauseUntil ? `Until ${params.pauseUntil}` : undefined),
      metadata: { pause_reason: params.pauseReason, pause_until: params.pauseUntil },
    });
  };

  const logKitResumed = async (params: LogKitActivityParams) => {
    await logActivity({
      ...params,
      activityType: 'kit_resumed',
      title: 'Keep in Touch resumed',
    });
  };

  const logKitCancelled = async (params: LogKitActivityParams) => {
    await logActivity({
      ...params,
      activityType: 'kit_cancelled',
      title: 'Keep in Touch cancelled',
    });
  };

  const logTouchAdded = async (
    params: LogKitActivityParams & { method: KitTouchMethod; scheduledDate: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_added',
      title: `New ${params.method} touch scheduled`,
      description: `Scheduled for ${params.scheduledDate}`,
      metadata: { method: params.method, scheduled_date: params.scheduledDate },
    });
  };

  const logTouchEdited = async (
    params: LogKitActivityParams & { method: KitTouchMethod; changes: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_touch_edited',
      title: `${params.method.charAt(0).toUpperCase() + params.method.slice(1)} touch updated`,
      description: params.changes,
      metadata: { method: params.method },
    });
  };

  const logTaskCreatedFromKit = async (
    params: LogKitActivityParams & { taskTitle: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_task_created',
      title: `Task created from KIT: "${params.taskTitle}"`,
      metadata: { task_title: params.taskTitle },
    });
  };

  const logReminderCreatedFromKit = async (
    params: LogKitActivityParams & { reminderTitle: string }
  ) => {
    await logActivity({
      ...params,
      activityType: 'kit_reminder_created',
      title: `Reminder created from KIT: "${params.reminderTitle}"`,
      metadata: { reminder_title: params.reminderTitle },
    });
  };

  return {
    logKitActivated,
    logTouchCompleted,
    logTouchSkipped,
    logTouchSnoozed,
    logTouchRescheduled,
    logTouchReassigned,
    logCycleCompleted,
    logKitPaused,
    logKitResumed,
    logKitCancelled,
    logTouchAdded,
    logTouchEdited,
    logTaskCreatedFromKit,
    logReminderCreatedFromKit,
  };
}
