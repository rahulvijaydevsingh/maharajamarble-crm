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

export interface CustomerPendingTasks {
  total: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  tasks: PendingTaskInfo[];
}

interface PendingTasksByCustomerContextType {
  tasksByCustomer: Record<string, CustomerPendingTasks>;
  getCustomerTasks: (customerId: string) => CustomerPendingTasks;
  loading: boolean;
  refetch: () => Promise<void>;
}

const PendingTasksByCustomerContext = createContext<PendingTasksByCustomerContextType | undefined>(undefined);

function usePendingTasksByCustomerStore() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingTasks = async () => {
    if (authLoading || !user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, due_time, assigned_to, priority, status, related_entity_id, related_entity_type")
        .in("status", ["Pending", "In Progress", "Not Started"])
        .eq("related_entity_type", "customer");

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
      .channel("pending-customer-tasks-changes")
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

  const tasksByCustomer = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const grouped: Record<string, CustomerPendingTasks> = {};

    tasks.forEach((task: any) => {
      const customerId = task.related_entity_id;
      if (!customerId) return;

      if (!grouped[customerId]) {
        grouped[customerId] = { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
      }

      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);

      grouped[customerId].total++;
      grouped[customerId].tasks.push(task);

      if (dueDate < today) {
        grouped[customerId].overdue++;
      } else if (dueDate.getTime() === today.getTime()) {
        grouped[customerId].dueToday++;
      } else {
        grouped[customerId].upcoming++;
      }
    });

    return grouped;
  }, [tasks]);

  const getCustomerTasks = (customerId: string): CustomerPendingTasks => {
    return tasksByCustomer[customerId] || { total: 0, overdue: 0, dueToday: 0, upcoming: 0, tasks: [] };
  };

  return {
    tasksByCustomer,
    getCustomerTasks,
    loading,
    refetch: fetchPendingTasks,
  };
}

export function PendingTasksByCustomerProvider({ children }: { children: React.ReactNode }) {
  const value = usePendingTasksByCustomerStore();
  return React.createElement(PendingTasksByCustomerContext.Provider, { value }, children);
}

export function usePendingTasksByCustomer() {
  const context = useContext(PendingTasksByCustomerContext);
  if (!context) {
    throw new Error("usePendingTasksByCustomer must be used within a PendingTasksByCustomerProvider");
  }
  return context;
}
