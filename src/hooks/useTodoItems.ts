import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TodoItem {
  id: string;
  list_id: string;
  title: string;
  notes: string | null;
  is_completed: boolean;
  is_starred: boolean;
  due_date: string | null;
  assigned_to: string | null;
  converted_to_task_id: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TodoItemInsert {
  list_id: string;
  title: string;
  notes?: string | null;
  is_completed?: boolean;
  is_starred?: boolean;
  due_date?: string | null;
  assigned_to?: string | null;
  sort_order?: number;
  created_by?: string;
}

export function useTodoItems(listId?: string) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchItems = async () => {
    if (!listId) {
      setItems([]);
      return;
    }
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("todo_items")
        .select("*")
        .eq("list_id", listId)
        .order("is_completed", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching items",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("todo_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching items",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (item: TodoItemInsert) => {
    try {
      const { data, error } = await supabase
        .from("todo_items")
        .insert([{ ...item, created_by: item.created_by || "Current User" }])
        .select()
        .single();

      if (error) throw error;
      setItems((prev) => [...prev, data]);
      return data;
    } catch (error: any) {
      toast({
        title: "Error adding item",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateItem = async (id: string, updates: Partial<TodoItemInsert> & { is_completed?: boolean; is_starred?: boolean }) => {
    try {
      // If marking as completed, set completed_at
      const updatesWithTimestamp = updates.is_completed 
        ? { ...updates, completed_at: new Date().toISOString() }
        : updates.is_completed === false 
          ? { ...updates, completed_at: null }
          : updates;

      const { data, error } = await supabase
        .from("todo_items")
        .update(updatesWithTimestamp)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating item",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from("todo_items")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error: any) {
      toast({
        title: "Error deleting item",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const toggleComplete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    return updateItem(id, { is_completed: !item.is_completed });
  };

  const toggleStar = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    return updateItem(id, { is_starred: !item.is_starred });
  };

  const markAsConverted = async (id: string, taskId: string) => {
    try {
      const { data, error } = await supabase
        .from("todo_items")
        .update({ converted_to_task_id: taskId })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating item",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    if (listId) {
      fetchItems();
    }
  }, [listId]);

  const completedCount = items.filter(i => i.is_completed).length;
  const totalCount = items.length;
  const starredCount = items.filter(i => i.is_starred).length;

  return {
    items,
    loading,
    addItem,
    updateItem,
    deleteItem,
    toggleComplete,
    toggleStar,
    markAsConverted,
    refetch: fetchItems,
    fetchAllItems,
    completedCount,
    totalCount,
    starredCount,
  };
}
