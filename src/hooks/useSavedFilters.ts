import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export interface FilterConfig {
  statusFilter: string[];
  assignedToFilter: string[];
  sourceFilter: string[];
  priorityFilter: string[];
  materialsFilter: string[];
  createdDateRange: { from: string | null; to: string | null };
  lastFollowUpRange: { from: string | null; to: string | null };
  nextFollowUpRange: { from: string | null; to: string | null };
  advancedRules?: Array<{
    field: string;
    operator: string;
    value: string;
    logic: "and" | "or";
  }>;
}

export interface SavedFilter {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  created_by: string;
  filter_config: FilterConfig;
  is_shared: boolean;
  is_default: boolean;
  entity_type: string;
}

export interface SavedFilterInsert {
  name: string;
  filter_config: FilterConfig;
  is_shared?: boolean;
  is_default?: boolean;
  entity_type?: string;
  created_by?: string;
}

export function useSavedFilters(entityType: string = "leads") {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFilters = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("saved_filters")
        .select("*")
        .eq("entity_type", entityType)
        .order("name", { ascending: true });

      if (error) throw error;
      const parsed = (data || []).map((item) => ({
        ...item,
        filter_config: item.filter_config as unknown as FilterConfig,
      }));
      setFilters(parsed);
    } catch (error: any) {
      toast({
        title: "Error fetching saved filters",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addFilter = async (filter: SavedFilterInsert) => {
    try {
      // If setting as default, unset other defaults first
      if (filter.is_default) {
        await supabase
          .from("saved_filters")
          .update({ is_default: false })
          .eq("entity_type", entityType)
          .eq("is_default", true);
      }

      const { data, error } = await supabase
        .from("saved_filters")
        .insert([{ 
          name: filter.name,
          filter_config: filter.filter_config as unknown as Json,
          is_shared: filter.is_shared,
          is_default: filter.is_default,
          entity_type: entityType,
          created_by: filter.created_by || "Current User" 
        }])
        .select()
        .single();

      if (error) throw error;
      const parsed = {
        ...data,
        filter_config: data.filter_config as unknown as FilterConfig,
      };
      setFilters((prev) => [...prev, parsed]);
      toast({ title: "Filter saved successfully" });
      return parsed;
    } catch (error: any) {
      toast({
        title: "Error saving filter",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateFilter = async (id: string, updates: Partial<SavedFilterInsert>) => {
    try {
      // If setting as default, unset other defaults first
      if (updates.is_default) {
        await supabase
          .from("saved_filters")
          .update({ is_default: false })
          .eq("entity_type", entityType)
          .eq("is_default", true);
      }

      const updatePayload: any = { ...updates };
      if (updates.filter_config) {
        updatePayload.filter_config = updates.filter_config as unknown as Json;
      }

      const { data, error } = await supabase
        .from("saved_filters")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      const parsed = {
        ...data,
        filter_config: data.filter_config as unknown as FilterConfig,
      };
      setFilters((prev) => prev.map((f) => (f.id === id ? parsed : f)));
      toast({ title: "Filter updated successfully" });
      return parsed;
    } catch (error: any) {
      toast({
        title: "Error updating filter",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteFilter = async (id: string) => {
    try {
      const { error } = await supabase
        .from("saved_filters")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setFilters((prev) => prev.filter((f) => f.id !== id));
      toast({ title: "Filter deleted successfully" });
    } catch (error: any) {
      toast({
        title: "Error deleting filter",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchFilters();
  }, [entityType]);

  return {
    filters,
    loading,
    addFilter,
    updateFilter,
    deleteFilter,
    refetch: fetchFilters,
  };
}
