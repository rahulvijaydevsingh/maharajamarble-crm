import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import React from "react";

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

interface TodoListsContextType {
  lists: TodoList[];
  loading: boolean;
  addList: (list: TodoListInsert) => Promise<any>;
  updateList: (id: string, updates: Partial<TodoListInsert>) => Promise<any>;
  deleteList: (id: string) => Promise<void>;
  archiveList: (id: string) => Promise<any>;
  togglePin: (id: string) => Promise<any>;
  refetch: () => Promise<void>;
}

const TodoListsContext = createContext<TodoListsContextType | undefined>(undefined);

function useTodoListsStore() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

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
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("jwt") || msg.includes("row-level security") || msg.includes("rls")) {
        console.warn("Transient auth error fetching todo lists, will retry once session is ready");
        return;
      }
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
      
      setLists((prev) => [optimisticList, ...prev]);

      const { created_by: _cb, ...listWithoutCb } = list as any;
      const { data, error } = await supabase
        .from("todo_lists")
        .insert([listWithoutCb])
        .select()
        .single();

      if (error) {
        setLists((prev) => prev.filter((l) => l.id !== tempId));
        throw error;
      }
      
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
    if (!user) {
      setLists([]);
      setLoading(false);
      return;
    }

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
  }, [user]);

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

export function TodoListsProvider({ children }: { children: React.ReactNode }) {
  const value = useTodoListsStore();
  return React.createElement(TodoListsContext.Provider, { value }, children);
}

export function useTodoLists() {
  const context = useContext(TodoListsContext);
  if (!context) {
    throw new Error("useTodoLists must be used within a TodoListsProvider");
  }
  return context;
}
