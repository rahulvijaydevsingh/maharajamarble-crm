import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";
import { logToStaffActivity } from "@/lib/staffActivityLogger";

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
  created_from_customer_id?: string | null;
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
  created_from_customer_id?: string | null;
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
        .not("status", "in", '("lost","deleted")')
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
      // Don't pass created_by — let DB default (get_current_user_email()) handle it
      // This ensures RLS is_assigned_to_me() works for non-admin users
      const { created_by: _cb, ...leadWithoutCreatedBy } = lead as any;
      const { data, error } = await supabase
        .from("leads")
        .insert([leadWithoutCreatedBy])
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
      const prevLead = leads.find((l) => l.id === id);
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setLeads((prev) => prev.map((lead) => (lead.id === id ? data : lead)));

      // Log to staff activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          const changedFields = Object.keys(updates).filter(
            (k) => prevLead && String((prevLead as any)[k]) !== String((updates as any)[k])
          );
          await logToStaffActivity(
            updates.status && prevLead?.status !== updates.status ? "update_lead_status" : "update_lead",
            u.email || "",
            u.id,
            `Updated lead: ${data.name}${changedFields.length ? ` (${changedFields.join(", ")})` : ""}`,
            "lead",
            id,
            { changed_fields: changedFields, old_status: prevLead?.status, new_status: updates.status }
          );
        }
      } catch (_) {}

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
      const leadToDelete = leads.find((l) => l.id === id);
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
      setLeads((prev) => prev.filter((lead) => lead.id !== id));

      // Log to staff activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity("delete_lead", u.email || "", u.id, `Deleted lead: ${leadToDelete?.name || id}`, "lead", id);
        }
      } catch (_) {}
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
