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
  related_entity_type: string | null;
  related_entity_id: string | null;
}

export interface ProfessionalPendingTasks {
  total: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  tasks: PendingTaskInfo[];
}

export function usePendingTasksByProfessional() {
  const [tasks, setTasks] = useState<PendingTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, due_time, assigned_to, priority, status, related_entity_type, related_entity_id")
        .neq("status", "Completed")
        .neq("status", "Cancelled")
        .eq("related_entity_type", "professional");

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
      .channel("pending-professional-tasks-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: "related_entity_type=eq.professional",
        },
        () => fetchPendingTasks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const tasksByProfessional = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    const grouped: Record<string, ProfessionalPendingTasks> = {};

    tasks.forEach((task: any) => {
      const professionalId = task.related_entity_type === 'professional'
        ? task.related_entity_id : null;

      if (!professionalId) return;

      if (!grouped[professionalId]) {
        grouped[professionalId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      // De-duplicate guard
      if (grouped[professionalId].tasks.some((t: any) => t.id === task.id)) return;

      grouped[professionalId].total++;
      grouped[professionalId].tasks.push(task);

      // Build a full datetime for the task using due_date + due_time (or 23:59 if no time)
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
        grouped[professionalId].overdue++;
      } else if (dueDateForSort.getTime() === today.getTime()) {
        grouped[professionalId].dueToday++;
      } else {
        grouped[professionalId].upcoming++;
      }
    });

    return grouped;
  }, [tasks]);

  const getProfessionalTasks = (professionalId: string): ProfessionalPendingTasks => {
    return tasksByProfessional[professionalId] || { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
  };

  return {
    tasksByProfessional,
    getProfessionalTasks,
    loading,
    refetch: fetchPendingTasks,
  };
}
