import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TodoList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_pinned: boolean;
  is_archived: boolean;
  is_shared: boolean;
  shared_with: string[];
  created_by: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Computed
  items_count?: number;
  completed_count?: number;
}

export interface TodoListInsert {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string;
  is_pinned?: boolean;
  is_shared?: boolean;
  shared_with?: string[];
  created_by?: string;
  sort_order?: number;
}

export function useTodoLists() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLists = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("todo_lists")
        .select("*")
        .eq("is_archived", false)
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setLists(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching to-do lists",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addList = async (list: TodoListInsert) => {
    try {
      // Optimistic update: add a temporary list immediately
      const tempId = `temp-${Date.now()}`;
      const optimisticList: TodoList = {
        id: tempId,
        name: list.name,
        description: list.description || null,
        color: list.color || "#3b82f6",
        icon: list.icon || "list",
        is_pinned: list.is_pinned || false,
        is_archived: false,
        is_shared: list.is_shared || false,
        shared_with: list.shared_with || [],
        created_by: list.created_by || "Current User",
        sort_order: list.sort_order || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // Add to UI immediately
      setLists((prev) => [optimisticList, ...prev]);

      const { data, error } = await supabase
        .from("todo_lists")
        .insert([{ ...list, created_by: list.created_by || "Current User" }])
        .select()
        .single();

      if (error) {
        // Rollback on error
        setLists((prev) => prev.filter((l) => l.id !== tempId));
        throw error;
      }
      
      // Replace temp with real data
      setLists((prev) => prev.map((l) => (l.id === tempId ? data : l)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error creating list",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateList = async (id: string, updates: Partial<TodoListInsert>) => {
    try {
      const { data, error } = await supabase
        .from("todo_lists")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setLists((prev) => prev.map((l) => (l.id === id ? data : l)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating list",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteList = async (id: string) => {
    try {
      const { error } = await supabase
        .from("todo_lists")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setLists((prev) => prev.filter((l) => l.id !== id));
    } catch (error: any) {
      toast({
        title: "Error deleting list",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const archiveList = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("todo_lists")
        .update({ is_archived: true })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setLists((prev) => prev.filter((l) => l.id !== id));
      return data;
    } catch (error: any) {
      toast({
        title: "Error archiving list",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const togglePin = async (id: string) => {
    const list = lists.find((l) => l.id === id);
    if (!list) return;

    try {
      const { data, error } = await supabase
        .from("todo_lists")
        .update({ is_pinned: !list.is_pinned })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setLists((prev) => prev.map((l) => (l.id === id ? data : l)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating list",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchLists();

    const channel = supabase
      .channel("todo-lists-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todo_lists" },
        () => {
          fetchLists();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    lists,
    loading,
    addList,
    updateList,
    deleteList,
    archiveList,
    togglePin,
    refetch: fetchLists,
  };
}
