import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingTaskInfo {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  assigned_to: string;
  priority: string;
  status: string;
}

export interface LeadPendingTasks {
  total: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  tasks: PendingTaskInfo[];
}

export function usePendingTasksByLead() {
  const [tasks, setTasks] = useState<PendingTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, due_time, assigned_to, priority, status, lead_id, related_entity_type, related_entity_id")
        .neq("status", "Completed")
        .neq("status", "Cancelled")
        .or("lead_id.not.is.null,and(related_entity_type.eq.lead,related_entity_id.not.is.null)");

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching pending tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingTasks();

    const channel = supabase
      .channel("pending-tasks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => fetchPendingTasks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const tasksByLead = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    const grouped: Record<string, LeadPendingTasks> = {};

    tasks.forEach((task: any) => {
      const leadId = task.lead_id
        || (task.related_entity_type === 'lead' ? task.related_entity_id : null);
      if (!leadId) return;

      if (!grouped[leadId]) {
        grouped[leadId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      // De-duplicate: a task linked via both lead_id and related_entity_id should count once
      if (grouped[leadId].tasks.some((t: any) => t.id === task.id)) return;

      grouped[leadId].total++;
      grouped[leadId].tasks.push(task);

      // Build a full datetime for the task using due_date + due_time (or 23:59 if no time)
      // so that a task due at 13:13 today is correctly overdue at 13:35 today.
      const dueDateOnly = task.due_date.includes('T')
        ? task.due_date.slice(0, 10)
        : task.due_date;
      const dueTimeStr = (task.due_time && /^\d{1,2}:\d{2}/.test(task.due_time))
        ? task.due_time.slice(0, 5)
        : '23:59';
      const fullDueDatetime = new Date(`${dueDateOnly}T${dueTimeStr}:00`);

      // Date-only comparison for dueToday/upcoming buckets
      const dueDateForSort = new Date(dueDateOnly);
      dueDateForSort.setHours(0, 0, 0, 0);

      if (fullDueDatetime < now) {
        // Past due datetime (catches intra-day overdue like 13:13 when it's 13:35)
        grouped[leadId].overdue++;
      } else if (dueDateForSort.getTime() === today.getTime()) {
        grouped[leadId].dueToday++;
      } else {
        grouped[leadId].upcoming++;
      }
    });

    return grouped;
  }, [tasks]);

  const getLeadTasks = (leadId: string): LeadPendingTasks => {
    return tasksByLead[leadId] || { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
  };

  return {
    tasksByLead,
    getLeadTasks,
    loading,
    refetch: fetchPendingTasks,
  };
}
