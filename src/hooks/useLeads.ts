import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export interface Lead {
  id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  designation: string;
  firm_name: string | null;
  additional_contacts: Json;
  site_location: string | null;
  site_photo_url: string | null;
  site_plus_code: string | null;
  construction_stage: string | null;
  estimated_quantity: number | null;
  material_interests: string[] | null;
  source: string;
  referred_by: Json | null;
  assigned_to: string;
  status: string;
  priority: number;
  notes: string | null;
  address: string | null;
  last_follow_up: string | null;
  next_follow_up: string | null;
}

export interface LeadInsert {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  designation?: string;
  firm_name?: string | null;
  additional_contacts?: any[];
  site_location?: string | null;
  site_photo_url?: string | null;
  site_plus_code?: string | null;
  construction_stage?: string | null;
  estimated_quantity?: number | null;
  material_interests?: string[];
  source?: string;
  referred_by?: any | null;
  assigned_to: string;
  status?: string;
  priority?: number;
  notes?: string | null;
  address?: string | null;
  created_by?: string;
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .or("is_converted.is.null,is_converted.eq.false")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching leads",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addLead = async (lead: LeadInsert) => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .insert([{ ...lead, created_by: lead.created_by || "Current User" }])
        .select()
        .single();

      if (error) throw error;
      setLeads((prev) => [data, ...prev]);
      return data;
    } catch (error: any) {
      toast({
        title: "Error adding lead",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateLead = async (id: string, updates: Partial<LeadInsert>) => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setLeads((prev) => prev.map((lead) => (lead.id === id ? data : lead)));
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating lead",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteLead = async (id: string) => {
    try {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
      setLeads((prev) => prev.filter((lead) => lead.id !== id));
    } catch (error: any) {
      toast({
        title: "Error deleting lead",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchLeads();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setLeads((prev) => [payload.new as Lead, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setLeads((prev) =>
              prev.map((lead) =>
                lead.id === payload.new.id ? (payload.new as Lead) : lead
              )
            );
          } else if (payload.eventType === "DELETE") {
            setLeads((prev) =>
              prev.filter((lead) => lead.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    leads,
    loading,
    addLead,
    updateLead,
    deleteLead,
    refetch: fetchLeads,
  };
}
