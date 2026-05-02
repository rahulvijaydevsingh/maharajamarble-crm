import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { calculateTaskStatus, TaskStatus } from "@/lib/taskStatusService";
import { useLogActivity } from "@/hooks/useActivityLog";
import { useAuth } from "@/contexts/AuthContext";
import { logToStaffActivity } from "@/lib/staffActivityLogger";

export interface Task {
  id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  assigned_to: string;
  due_date: string;
  due_time: string | null;
  lead_id: string | null;
  reminder: boolean;
  reminder_time: string | null;
  completed_at: string | null;
  // Completion workflow fields
  completion_status?: string | null;
  completion_outcome?: string | null;
  completion_notes?: string | null;
  completion_key_points?: any | null;
  next_action_type?: string | null;
  next_action_payload?: any | null;
  // Attempt tracking / deal conversion
  attempt_count?: number | null;
  last_attempt_at?: string | null;
  max_attempts?: number | null;
  deal_ready?: boolean | null;
  deal_ready_at?: string | null;
  // New enhanced fields
  is_starred: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_recurring: boolean;
  recurrence_frequency: string | null;
  recurrence_interval: number;
  recurrence_days_of_week: string[] | null;
  recurrence_day_of_month: number | null;
  recurrence_month: number | null;
  recurrence_reset_from_completion: boolean;
  recurrence_end_type: string;
  recurrence_end_date: string | null;
  recurrence_occurrences_limit: number | null;
  recurrence_occurrences_count: number;
  parent_task_id: string | null;
  snoozed_until: string | null;
  original_due_date: string | null;
  // Closure & scheduling fields
  closed_at?: string | null;
  closed_by?: string | null;
  reschedule_count?: number;
  reschedule_reason?: string | null;
  reminder_offset_hours?: number | null;
  custom_reminder_at?: string | null;
  // Joined lead data
  lead?: {
    id: string;
    name: string;
    phone: string;
    site_plus_code?: string | null;
  } | null;
  // Computed fields
  subtasks_count?: number;
  subtasks_completed?: number;
  // Calculated status (computed, not stored)
  calculatedStatus?: TaskStatus;
}

export interface TaskInsert {
  title: string;
  description?: string | null;
  type?: string;
  priority?: string;
  status?: string;
  assigned_to: string;
  due_date: string;
  due_time?: string | null;
  lead_id?: string | null;
  reminder?: boolean;
  reminder_time?: string | null;
  created_by?: string;
  // Completion workflow fields (optional)
  completion_status?: string | null;
  completion_outcome?: string | null;
  completion_notes?: string | null;
  completion_key_points?: any | null;
  next_action_type?: string | null;
  next_action_payload?: any | null;
  attempt_count?: number | null;
  last_attempt_at?: string | null;
  max_attempts?: number | null;
  deal_ready?: boolean | null;
  deal_ready_at?: string | null;
  // New enhanced fields
  is_starred?: boolean;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: string | null;
  recurrence_interval?: number;
  recurrence_days_of_week?: string[] | null;
  recurrence_day_of_month?: number | null;
  recurrence_month?: number | null;
  recurrence_reset_from_completion?: boolean;
  recurrence_end_type?: string;
  recurrence_end_date?: string | null;
  recurrence_occurrences_limit?: number | null;
  parent_task_id?: string | null;
  original_due_date?: string | null;
  // Closure & scheduling fields
  closed_at?: string | null;
  closed_by?: string | null;
  reschedule_count?: number;
  reschedule_reason?: string | null;
  reminder_offset_hours?: number | null;
  custom_reminder_at?: string | null;
}

// Helper function to calculate next due date based on recurrence settings
function calculateNextDueDate(
  baseDateStr: string,
  frequency: string,
  interval: number,
  daysOfWeek?: string[] | null
): string {
  const baseDate = new Date(baseDateStr);
  
  switch (frequency) {
    case "daily":
      return addDays(baseDate, interval).toISOString().split("T")[0];
    case "weekly":
      return addWeeks(baseDate, interval).toISOString().split("T")[0];
    case "monthly":
      return addMonths(baseDate, interval).toISOString().split("T")[0];
    case "yearly":
      return addYears(baseDate, interval).toISOString().split("T")[0];
    default:
      return baseDateStr;
  }
}

const FOLLOWUP_ACTIVITY_TYPES = [
  'call',
  'site_visit',
  'meeting',
  'whatsapp_sent',
  'email_sent',
  'follow_up_completed',
  'note_added'
];

/**
 * Explicitly sync follow-up dates for a lead by checking tasks and activity log.
 * Wrapped in try/catch to never block the main operation.
 */
const syncLeadFollowUpDates = async (leadId: string) => {
  if (!leadId) return;

  try {
    // 1. Get MAX(completed_at) from tasks
    const { data: taskFollowup } = await supabase
      .from('tasks')
      .select('completed_at')
      .eq('lead_id', leadId)
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Get MAX(created_at) from activity_log
    const { data: activityFollowup } = await supabase
      .from('activity_log')
      .select('created_at')
      .eq('lead_id', leadId)
      .in('activity_type', FOLLOWUP_ACTIVITY_TYPES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Get MIN(due_date) from pending tasks
    const { data: nextTask } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('lead_id', leadId)
      .in('status', ['Pending', 'In Progress'])
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    const lastTaskDate = taskFollowup?.completed_at ? new Date(taskFollowup.completed_at) : null;
    const lastActivityDate = activityFollowup?.created_at ? new Date(activityFollowup.created_at) : null;

    let lastFollowUp: string | null = null;
    if (lastTaskDate && lastActivityDate) {
      lastFollowUp = lastTaskDate > lastActivityDate ? lastTaskDate.toISOString() : lastActivityDate.toISOString();
    } else if (lastTaskDate) {
      lastFollowUp = lastTaskDate.toISOString();
    } else if (lastActivityDate) {
      lastFollowUp = lastActivityDate.toISOString();
    }

    const nextFollowUp = nextTask?.due_date || null;

    // 4. Update leads table
    await supabase
      .from('leads')
      .update({
        last_follow_up: lastFollowUp,
        next_follow_up: nextFollowUp,
      })
      .eq('id', leadId);

  } catch (error) {
    console.error(`[syncLeadFollowUpDates] Failed for lead ${leadId}:`, error);
  }
};

/**
 * Customer-side equivalent of syncLeadFollowUpDates. Customers track tasks via
 * related_entity_type='customer' AND related_entity_id=<customer_id>.
 * The DB trigger is the source of truth; this gives immediate optimistic UI.
 */
const syncCustomerFollowUpDates = async (customerId: string) => {
  if (!customerId) return;

  try {
    const { data: taskFollowup } = await supabase
      .from('tasks')
      .select('completed_at')
      .eq('related_entity_type', 'customer')
      .eq('related_entity_id', customerId)
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: nextTask } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('related_entity_type', 'customer')
      .eq('related_entity_id', customerId)
      .in('status', ['Pending', 'In Progress'])
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    const lastFollowUp = taskFollowup?.completed_at || null;
    const nextFollowUp = nextTask?.due_date || null;

    await supabase
      .from('customers')
      .update({
        last_follow_up: lastFollowUp,
        next_follow_up: nextFollowUp,
      })
      .eq('id', customerId);
  } catch (error) {
    console.error(`[syncCustomerFollowUpDates] Failed for customer ${customerId}:`, error);
  }
};

/**
 * Compute the fire timestamp for a task reminder from its fields.
 * Returns ISO string, or null if not computable.
 * fire_at = (due_date + (due_time or 09:00 local)) - reminder_time minutes
 */
const computeTaskReminderFireAt = (task: {
  due_date?: string | null;
  due_time?: string | null;
  reminder_time?: string | null;
}): string | null => {
  if (!task.due_date) return null;
  const offsetMinutes = parseInt(task.reminder_time || '0', 10);
  if (Number.isNaN(offsetMinutes)) return null;
  const time = (task.due_time && /^\d{1,2}:\d{2}/.test(task.due_time)) ? task.due_time : '09:00';
  // Construct as local time
  const dueDateOnly = task.due_date.includes('T') ? task.due_date.slice(0, 10) : task.due_date;
  const localDue = new Date(`${dueDateOnly}T${time.length === 5 ? time : time.slice(0, 5)}:00`);
  if (Number.isNaN(localDue.getTime())) return null;
  const fireAt = new Date(localDue.getTime() - offsetMinutes * 60_000);
  return fireAt.toISOString();
};

/**
 * Mirror a task's reminder fields into the `reminders` table so the bell can fire.
 * - reminder=true & open & future fire time → upsert one row keyed by (entity_type='task', entity_id=task.id)
 * - otherwise (disabled, completed, cancelled, past) → delete any matching row(s)
 *
 * `overrides.fireAt` lets snoozeTask provide an explicit fire time and title.
 */
const syncTaskReminder = async (
  task: {
    id: string;
    title: string;
    status?: string | null;
    reminder?: boolean | null;
    reminder_time?: string | null;
    due_date?: string | null;
    due_time?: string | null;
    assigned_to?: string | null;
    created_by?: string | null;
  },
  overrides?: { fireAt?: string; title?: string }
) => {
  if (!task?.id) return;

  const isClosed = task.status === 'Completed' || task.status === 'Cancelled';
  const wantsReminder = !!task.reminder && !isClosed;

  const fireAt = overrides?.fireAt || (wantsReminder ? computeTaskReminderFireAt(task) : null);
  const isFuture = fireAt ? new Date(fireAt).getTime() > Date.now() : false;

  try {
    if ((wantsReminder || overrides?.fireAt) && fireAt && isFuture) {
      // Upsert: delete then insert is simplest given no unique constraint
      await supabase
        .from('reminders')
        .delete()
        .eq('entity_type', 'task')
        .eq('entity_id', task.id);

      await supabase.from('reminders').insert({
        title: overrides?.title || `Reminder: ${task.title}`,
        description: null,
        reminder_datetime: fireAt,
        entity_type: 'task',
        entity_id: task.id,
        is_dismissed: false,
        is_snoozed: false,
        assigned_to: task.assigned_to || 'System',
      } as any);
    } else {
      // Disabled / closed / past → remove any existing
      await supabase
        .from('reminders')
        .delete()
        .eq('entity_type', 'task')
        .eq('entity_id', task.id);
    }
  } catch (error) {
    console.warn(`[syncTaskReminder] Failed for task ${task.id}:`, error);
  }
};

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { logActivity } = useLogActivity();
  const { user, profile } = useAuth();

  const getActivityContext = (task: Partial<TaskInsert> & { lead_id?: string | null; related_entity_type?: string | null; related_entity_id?: string | null }) => {
    const leadId = task.lead_id || null;
    const customerId = task.related_entity_type === "customer" ? (task.related_entity_id || null) : null;
    return { leadId, customerId };
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          lead:leads(id, name, phone, site_plus_code)
        `)
        .order("due_date", { ascending: true });

      if (error) throw error;
      
      // Add calculated status to each task
      const tasksWithCalculatedStatus = (data || []).map(task => ({
        ...task,
        calculatedStatus: calculateTaskStatus(task),
      }));
      
      setTasks(tasksWithCalculatedStatus);
    } catch (error: any) {
      toast({
        title: "Error fetching tasks",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (task: TaskInsert) => {
    try {
      const taskData = {
        ...task,
        created_by: (task.created_by && task.created_by !== "Current User") ? task.created_by : (profile?.full_name || user?.email || "unknown"),
        original_due_date: task.original_due_date || task.due_date,
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert([taskData])
        .select(`
          *,
          lead:leads(id, name, phone, site_plus_code)
        `)
        .single();

      if (error) throw error;
      setTasks((prev) => [...prev, { ...data, calculatedStatus: calculateTaskStatus(data) }]);

      // Always log creation (this fixes missing logs after remix and ensures consistency)
      try {
        const { leadId, customerId } = getActivityContext(taskData);
        await logActivity({
          lead_id: leadId || undefined,
          customer_id: customerId || undefined,
          activity_type: "task_created",
          activity_category: "task",
          title: `Task Created: ${data.title}`,
          description: data.description || undefined,
          metadata: {
            task_id: data.id,
            assigned_to: data.assigned_to,
            due_date: data.due_date,
            due_time: data.due_time,
            priority: data.priority,
            status: data.status,
            related_entity_type: data.related_entity_type,
            related_entity_id: data.related_entity_id,
            lead_id: data.lead_id,
          },
          related_entity_type: data.related_entity_type || undefined,
          related_entity_id: data.related_entity_id || undefined,
        });
      } catch (e) {
        console.warn("Failed to log task_created activity", e);
      }

      // Log to staff_activity_log
      try {
        if (user) {
          await logToStaffActivity("create_task", user.email || "", user.id, `Created task: ${data.title}`, "task", data.id);
        }
      } catch (_) {
        // Staff activity log is non-critical — failure is acceptable
      }

      // Sync follow-up dates for linked lead
      if (data.lead_id) void syncLeadFollowUpDates(data.lead_id);
      if (data.related_entity_type === 'lead' && data.related_entity_id && data.related_entity_id !== data.lead_id) {
        void syncLeadFollowUpDates(data.related_entity_id);
      }
      // Sync follow-up dates for linked customer
      if (data.related_entity_type === 'customer' && data.related_entity_id) {
        void syncCustomerFollowUpDates(data.related_entity_id);
      }
      // Mirror task reminder into reminders table so the bell can fire
      void syncTaskReminder(data);

      return data;
    } catch (error: any) {
      toast({
        title: "Error adding task",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  // Helper: silently advance linked lead from 'new' -> 'in_progress' on meaningful interaction
  const maybeAdvanceLeadToInProgress = async (
    task: Partial<Task> | any,
    updates: Partial<TaskInsert> & { snoozed_until?: string | null }
  ) => {
    try {
      const qualifies =
        updates.status === "Completed" ||
        !!updates.snoozed_until ||
        (!!updates.due_date && updates.status !== "Completed");
      if (!qualifies) return;

      const leadId =
        task?.related_entity_type === "lead"
          ? task?.related_entity_id
          : task?.lead_id || null;
      if (!leadId) return;

      const { data: leadRow } = await supabase
        .from("leads")
        .select("status")
        .eq("id", leadId)
        .maybeSingle();

      if (leadRow?.status === "new") {
        await supabase.from("leads").update({ status: "in-progress" }).eq("id", leadId);
      }
    } catch (_) {
      // Silent — never block the parent task operation
    }
  };

  const updateTask = async (id: string, updates: Partial<TaskInsert> & { completed_at?: string | null; snoozed_until?: string | null }) => {
    try {
      const prevTask = tasks.find((t) => t.id === id) || null;

      // If marking as completed, set completed_at
      if (updates.status === "Completed") {
        updates = { ...updates, completed_at: new Date().toISOString() };
      }

      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          lead:leads(id, name, phone, site_plus_code)
        `)
        .single();

      if (error) throw error;
      setTasks((prev) => prev.map((task) => (task.id === id ? data : task)));

      // Silently advance linked lead status from 'new' -> 'in-progress' on meaningful interactions
      void maybeAdvanceLeadToInProgress(data, updates);

      try {
        const activityType =
          updates.status === "Completed" ? "task_completed" :
          updates.snoozed_until ? "task_snoozed" :
          "task_updated";

        const leadId = data.lead_id || undefined;
        const customerId = data.related_entity_type === "customer" ? (data.related_entity_id || undefined) : undefined;

        await logActivity({
          lead_id: leadId,
          customer_id: customerId,
          activity_type: activityType,
          activity_category: "task",
          title: `${activityType === "task_completed" ? "Task Completed" : activityType === "task_snoozed" ? "Task Snoozed" : "Task Updated"}: ${data.title}`,
          description: data.description || undefined,
          metadata: {
            task_id: data.id,
            previous: prevTask
              ? {
                  status: prevTask.status,
                  due_date: prevTask.due_date,
                  due_time: prevTask.due_time,
                  assigned_to: prevTask.assigned_to,
                  priority: prevTask.priority,
                  snoozed_until: prevTask.snoozed_until,
                }
              : null,
            updates,
          },
          related_entity_type: data.related_entity_type || undefined,
          related_entity_id: data.related_entity_id || undefined,
        });
      } catch (e) {
        console.warn("Failed to log task update activity", e);
      }

      // Log to staff_activity_log
      try {
        if (user) {
          const actType = updates.status === "Completed" ? "task_completed" : "update_task";
          await logToStaffActivity(actType, user.email || "", user.id, `${actType === "task_completed" ? "Completed" : "Updated"} task: ${data.title}`, "task", data.id);
        }
      } catch (_) {
        // Staff activity log is non-critical — failure is acceptable
      }

      // Sync follow-up dates for linked lead
      if (data.lead_id) void syncLeadFollowUpDates(data.lead_id);
      if (data.related_entity_type === 'lead' && data.related_entity_id && data.related_entity_id !== data.lead_id) {
        void syncLeadFollowUpDates(data.related_entity_id);
      }
      // Sync follow-up dates for linked customer
      if (data.related_entity_type === 'customer' && data.related_entity_id) {
        void syncCustomerFollowUpDates(data.related_entity_id);
      }
      // Re-mirror task reminder (handles enable/disable, due date change, completion, cancellation)
      void syncTaskReminder(data);
      if (updates.status === 'Completed') {
        try {
          const { data: linkedTouch } = await supabase
            .from('kit_touches')
            .select('id')
            .eq('linked_task_id', id)
            .maybeSingle();

          if (linkedTouch) {
            await supabase
              .from('kit_touches')
              .update({
                status: 'completed',
                outcome: (updates as any).completion_outcome || 'completed_via_task',
                outcome_notes: (updates as any).completion_notes || null,
                completed_at: new Date().toISOString(),
              })
              .eq('id', linkedTouch.id);
          }
        } catch (_kitErr) {
          // KIT sync is non-critical — do not throw
        }
      }

      // KIT ↔ Task sync: reschedule (due_date changed) syncs to linked kit_touch
      if (updates.due_date && updates.status !== 'Completed') {
        try {
          const { data: linkedTouch } = await supabase
            .from('kit_touches')
            .select('id, reschedule_count')
            .eq('linked_task_id', id)
            .maybeSingle();

          if (linkedTouch) {
            await supabase
              .from('kit_touches')
              .update({
                scheduled_date: updates.due_date,
                status: 'pending',
                snoozed_until: null,
                reschedule_count: (linkedTouch.reschedule_count || 0) + 1,
              })
              .eq('id', linkedTouch.id);
          }
        } catch (_kitErr) {
          // KIT sync is non-critical
        }
      }

      return data;
    } catch (error: any) {
      toast({
        title: "Error updating task",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const completeRecurringTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.is_recurring) {
      return updateTask(id, { status: "Completed" });
    }

    try {
      // Mark current task as completed
      await updateTask(id, { status: "Completed" });

      // Check if we should generate next instance
      if (task.recurrence_end_type === "after_occurrences" && task.recurrence_occurrences_limit) {
        if (task.recurrence_occurrences_count + 1 >= task.recurrence_occurrences_limit) {
          toast({ title: "Recurring task series completed" });
          return;
        }
      }

      if (task.recurrence_end_type === "on_date" && task.recurrence_end_date) {
        const endDate = new Date(task.recurrence_end_date);
        if (new Date() >= endDate) {
          toast({ title: "Recurring task series ended" });
          return;
        }
      }

      // Calculate next due date
      const baseDate = task.recurrence_reset_from_completion 
        ? new Date().toISOString().split("T")[0]
        : task.due_date;

      const nextDueDate = calculateNextDueDate(
        baseDate,
        task.recurrence_frequency || "daily",
        task.recurrence_interval || 1,
        task.recurrence_days_of_week
      );

      // Create next instance
      const nextTask: TaskInsert = {
        title: task.title,
        description: task.description,
        type: task.type,
        priority: task.priority,
        status: "Pending",
        assigned_to: task.assigned_to,
        due_date: nextDueDate,
        due_time: task.due_time,
        lead_id: task.lead_id,
        reminder: task.reminder,
        reminder_time: task.reminder_time,
        created_by: task.created_by,
        is_starred: task.is_starred,
        related_entity_type: task.related_entity_type,
        related_entity_id: task.related_entity_id,
        is_recurring: true,
        recurrence_frequency: task.recurrence_frequency,
        recurrence_interval: task.recurrence_interval,
        recurrence_days_of_week: task.recurrence_days_of_week,
        recurrence_day_of_month: task.recurrence_day_of_month,
        recurrence_month: task.recurrence_month,
        recurrence_reset_from_completion: task.recurrence_reset_from_completion,
        recurrence_end_type: task.recurrence_end_type,
        recurrence_end_date: task.recurrence_end_date,
        recurrence_occurrences_limit: task.recurrence_occurrences_limit,
        parent_task_id: task.parent_task_id || task.id,
        original_due_date: task.original_due_date,
      };

      // Update occurrences count on parent or create new
      if (task.parent_task_id) {
        await supabase
          .from("tasks")
          .update({ recurrence_occurrences_count: task.recurrence_occurrences_count + 1 })
          .eq("id", task.parent_task_id);
      }

      await addTask(nextTask);
      toast({ title: "Next recurring task created" });
    } catch (error: any) {
      toast({
        title: "Error completing recurring task",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const snoozeTask = async (id: string, hoursToAdd: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      const snoozedUntil = new Date();
      snoozedUntil.setHours(snoozedUntil.getHours() + hoursToAdd);

      // Log snooze history
      await supabase.from("task_snooze_history").insert([{
        task_id: id,
        original_due_date: task.due_date,
        original_due_time: task.due_time,
        snoozed_until: snoozedUntil.toISOString(),
        // created_by handled by DB default
      }]);

      // Calculate new due date
      const newDueDate = snoozedUntil.toISOString().split("T")[0];
      const newDueTime = snoozedUntil.toTimeString().slice(0, 5);

      await updateTask(id, {
        due_date: newDueDate,
        due_time: newDueTime,
        snoozed_until: snoozedUntil.toISOString(),
      });

      // Log to task_activity_log
      try {
        await (supabase.from("task_activity_log" as any).insert as any)({
          task_id: id,
          event_type: "snoozed",
          metadata: {
            snoozed_until: snoozedUntil.toISOString(),
            hours_added: hoursToAdd,
            original_due_date: task.due_date,
          },
        });
      } catch (e: any) { console.error('[useTasks/snoozeTask] Failed to log snooze to task_activity_log:', e?.message || e); }

      // Log to lead activity_log if task has lead_id
      try {
        if (task.lead_id) {
          await supabase.from("activity_log").insert({
            lead_id: task.lead_id,
            activity_type: "task_snoozed",
            activity_category: "task",
            user_id: user?.id || null,
            user_name: profile?.full_name || user?.email?.split("@")[0] || "System",
            title: `Task Snoozed: ${task.title} — until ${snoozedUntil.toLocaleDateString()}`,
            metadata: {
              task_id: task.id,
              snoozed_until: snoozedUntil.toISOString(),
              original_due_date: task.due_date,
              hours_added: hoursToAdd,
            } as any,
            related_entity_type: "task",
            related_entity_id: task.id,
            is_manual: false,
            is_editable: false,
          });
        }
      } catch (e: any) { console.error('[useTasks/snoozeTask] Failed to log snooze to lead activity_log:', e?.message || e); }

      // Sync follow-up dates for linked lead
      if (task.lead_id) void syncLeadFollowUpDates(task.lead_id);
      if (task.related_entity_type === 'lead' && task.related_entity_id && task.related_entity_id !== task.lead_id) {
        void syncLeadFollowUpDates(task.related_entity_id);
      }

      // Snooze the task's linked reminder (if any)
      try {
        const { data: taskReminders } = await supabase
          .from("reminders")
          .select("id")
          .eq("entity_type", "task")
          .eq("entity_id", id)
          .eq("is_dismissed", false);

        if (taskReminders && taskReminders.length > 0) {
          await supabase
            .from("reminders")
            .update({
              is_snoozed: true,
              snooze_until: snoozedUntil.toISOString(),
            })
            .in("id", taskReminders.map((r: { id: string }) => r.id));
        }
      } catch (e: any) {
        console.warn("[useTasks/snoozeTask] Failed to snooze linked task reminder:", e?.message || e);
      }

      toast({ title: "Task snoozed" });
    } catch (error: any) {
      toast({
        title: "Error snoozing task",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const toggleStar = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    return updateTask(id, { is_starred: !task.is_starred });
  };

  const deleteTask = async (id: string) => {
    try {
      const taskToDelete = tasks.find((t) => t.id === id) || null;
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      setTasks((prev) => prev.filter((task) => task.id !== id));

      try {
        const leadId = taskToDelete?.lead_id || undefined;
        const customerId = taskToDelete?.related_entity_type === "customer" ? (taskToDelete?.related_entity_id || undefined) : undefined;

        await logActivity({
          lead_id: leadId,
          customer_id: customerId,
          activity_type: "task_deleted",
          activity_category: "task",
          title: `Task Deleted: ${taskToDelete?.title || "(unknown)"}`,
          metadata: {
            task_id: id,
            task: taskToDelete,
          },
          related_entity_type: taskToDelete?.related_entity_type || undefined,
          related_entity_id: taskToDelete?.related_entity_id || undefined,
        });
      } catch (e) {
        console.warn("Failed to log task_deleted activity", e);
      }

      // Log to staff_activity_log
      try {
        if (user) {
          await logToStaffActivity("task_deleted", user.email || "", user.id, `Deleted task: ${taskToDelete?.title || id}`, "task", id);
        }
      } catch (_) {
        // Staff activity log is non-critical — failure is acceptable
      }

      // Sync follow-up dates for linked lead
      if (taskToDelete?.lead_id) void syncLeadFollowUpDates(taskToDelete.lead_id);
      if (taskToDelete?.related_entity_type === 'lead' && taskToDelete?.related_entity_id && taskToDelete?.related_entity_id !== taskToDelete?.lead_id) {
        void syncLeadFollowUpDates(taskToDelete.related_entity_id);
      }
    } catch (error: any) {
      toast({
        title: "Error deleting task",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchTasks();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("tasks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          // Refetch to get joined lead data
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
    completeRecurringTask,
    snoozeTask,
    toggleStar,
    refetch: fetchTasks,
  };
}
