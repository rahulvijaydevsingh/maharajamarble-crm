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
        .select("id, title, due_date, due_time, assigned_to, priority, status, lead_id")
        .in("status", ["Pending", "In Progress", "Not Started"])
        .not("lead_id", "is", null);

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

    const grouped: Record<string, LeadPendingTasks> = {};

    tasks.forEach((task: any) => {
      const leadId = task.lead_id;
      if (!leadId) return;

      if (!grouped[leadId]) {
        grouped[leadId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);

      grouped[leadId].total++;
      grouped[leadId].tasks.push(task);

      if (dueDate < today) {
        grouped[leadId].overdue++;
      } else if (dueDate.getTime() === today.getTime()) {
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
