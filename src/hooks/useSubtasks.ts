import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubtaskInsert {
  task_id: string;
  title: string;
  is_completed?: boolean;
  sort_order?: number;
  assigned_to?: string | null;
}

export function useSubtasks(taskId?: string) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSubtasks = async () => {
    if (!taskId) {
      setSubtasks([]);
      return;
    }
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("*")
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setSubtasks(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching subtasks",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addSubtask = async (subtask: SubtaskInsert) => {
    try {
      const { data, error } = await supabase
        .from("task_subtasks")
        .insert([subtask])
        .select()
        .single();

      if (error) throw error;
      setSubtasks((prev) => [...prev, data]);
      return data;
    } catch (error: any) {
      toast({
        title: "Error adding subtask",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateSubtask = async (id: string, updates: Partial<SubtaskInsert> & { is_completed?: boolean }) => {
    try {
      // If marking as completed, set completed_at
      const updatesWithTimestamp = updates.is_completed 
        ? { ...updates, completed_at: new Date().toISOString() }
        : updates.is_completed === false 
          ? { ...updates, completed_at: null }
          : updates;

      const { data, error } = await supabase
        .from("task_subtasks")
        .update(updatesWithTimestamp)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setSubtasks((prev) => prev.map((s) => (s.id === id ? data : s)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating subtask",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteSubtask = async (id: string) => {
    try {
      const { error } = await supabase
        .from("task_subtasks")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setSubtasks((prev) => prev.filter((s) => s.id !== id));
    } catch (error: any) {
      toast({
        title: "Error deleting subtask",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const reorderSubtasks = async (reorderedSubtasks: Subtask[]) => {
    try {
      const updates = reorderedSubtasks.map((s, index) => ({
        id: s.id,
        sort_order: index,
      }));

      for (const update of updates) {
        await supabase
          .from("task_subtasks")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
      }

      setSubtasks(reorderedSubtasks.map((s, index) => ({ ...s, sort_order: index })));
    } catch (error: any) {
      toast({
        title: "Error reordering subtasks",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchSubtasks();
  }, [taskId]);

  const completedCount = subtasks.filter(s => s.is_completed).length;
  const totalCount = subtasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    subtasks,
    loading,
    addSubtask,
    updateSubtask,
    deleteSubtask,
    reorderSubtasks,
    refetch: fetchSubtasks,
    completedCount,
    totalCount,
    progress,
  };
}
