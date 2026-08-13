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

interface PendingTasksByProfessionalContextType {
  tasksByProfessional: Record<string, ProfessionalPendingTasks>;
  getProfessionalTasks: (professionalId: string) => ProfessionalPendingTasks;
  loading: boolean;
  refetch: () => Promise<void>;
}

const PendingTasksByProfessionalContext = createContext<PendingTasksByProfessionalContextType | undefined>(undefined);

function usePendingTasksByProfessionalStore() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<PendingTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingTasks = async () => {
    if (authLoading || !user) return;
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
    if (authLoading || !user) return;
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
  }, [authLoading, user]);

  const tasksByProfessional = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    const grouped: Record<string, ProfessionalPendingTasks> = {};

    tasks.forEach((task: any) => {
      const professionalId = task.related_entity_type === "professional"
        ? task.related_entity_id : null;

      if (!professionalId) return;

      if (!grouped[professionalId]) {
        grouped[professionalId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      if (grouped[professionalId].tasks.some((t: any) => t.id === task.id)) return;

      grouped[professionalId].total++;
      grouped[professionalId].tasks.push(task);

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

export function PendingTasksByProfessionalProvider({ children }: { children: React.ReactNode }) {
  const value = usePendingTasksByProfessionalStore();
  return React.createElement(PendingTasksByProfessionalContext.Provider, { value }, children);
}

export function usePendingTasksByProfessional() {
  const context = useContext(PendingTasksByProfessionalContext);
  if (!context) {
    throw new Error("usePendingTasksByProfessional must be used within a PendingTasksByProfessionalProvider");
  }
  return context;
}
