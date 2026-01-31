import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { calculateTaskStatus, TaskStatus } from "@/lib/taskStatusService";
import { useLogActivity } from "@/hooks/useActivityLog";

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

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { logActivity } = useLogActivity();

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
        created_by: task.created_by || "Current User",
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
      setTasks((prev) => [...prev, data]);

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
        // Never block task creation if activity log fails
        console.warn("Failed to log task_created activity", e);
      }

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
        created_by: "Current User",
      }]);

      // Calculate new due date
      const newDueDate = snoozedUntil.toISOString().split("T")[0];
      const newDueTime = snoozedUntil.toTimeString().slice(0, 5);

      await updateTask(id, {
        due_date: newDueDate,
        due_time: newDueTime,
        snoozed_until: snoozedUntil.toISOString(),
      });

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
