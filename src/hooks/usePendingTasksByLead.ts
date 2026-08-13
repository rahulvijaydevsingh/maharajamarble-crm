import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import React from "react";

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

interface PendingTasksByLeadContextType {
  tasksByLead: Record<string, LeadPendingTasks>;
  getLeadTasks: (leadId: string) => LeadPendingTasks;
  loading: boolean;
  refetch: () => Promise<void>;
}

const PendingTasksByLeadContext = createContext<PendingTasksByLeadContextType | undefined>(undefined);

function usePendingTasksByLeadStore() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<PendingTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingTasks = async () => {
    if (authLoading || !user) return;
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
    if (authLoading || !user) return;
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
  }, [authLoading, user]);

  const tasksByLead = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    const grouped: Record<string, LeadPendingTasks> = {};

    tasks.forEach((task: any) => {
      const leadId = task.lead_id
        || (task.related_entity_type === "lead" ? task.related_entity_id : null);
      if (!leadId) return;

      if (!grouped[leadId]) {
        grouped[leadId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      if (grouped[leadId].tasks.some((t: any) => t.id === task.id)) return;

      grouped[leadId].total++;
      grouped[leadId].tasks.push(task);

      const dueDateOnly = task.due_date.includes("T")
        ? task.due_date.slice(0, 10)
        : task.due_date;
      const dueTimeStr = (task.due_time && /^\d{1,2}:\d{2}/.test(task.due_time))
        ? task.due_time.slice(0, 5)
        : "23:59";
      const fullDueDatetime = new Date(`${dueDateOnly}T${dueTimeStr}:00`);

      const dueDateForSort = new Date(dueDateOnly);
      dueDateForSort.setHours(0, 0, 0, 0);

      if (fullDueDatetime < now) {
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

export function PendingTasksByLeadProvider({ children }: { children: React.ReactNode }) {
  const value = usePendingTasksByLeadStore();
  return React.createElement(PendingTasksByLeadContext.Provider, { value }, children);
}

export function usePendingTasksByLead() {
  const context = useContext(PendingTasksByLeadContext);
  if (!context) {
    throw new Error("usePendingTasksByLead must be used within a PendingTasksByLeadProvider");
  }
  return context;
}
