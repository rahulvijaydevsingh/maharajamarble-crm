import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Professional {
  id: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  firm_name: string | null;
  address: string | null;
  city: string | null;
  professional_type: string;
  service_category: string | null;
  status: string;
  priority: number;
  rating: number | null;
  total_projects: number;
  notes: string | null;
  referred_by: any | null;
  assigned_to: string;
  created_by: string;
  last_follow_up: string | null;
  next_follow_up: string | null;
  created_at: string;
  updated_at: string;
  site_plus_code?: string | null;
}

export interface ProfessionalInsert {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  firm_name?: string | null;
  address?: string | null;
  city?: string | null;
  professional_type?: string;
  service_category?: string | null;
  status?: string;
  priority?: number;
  rating?: number | null;
  total_projects?: number;
  notes?: string | null;
  referred_by?: any | null;
  assigned_to: string;
  created_by?: string;
  last_follow_up?: string | null;
  next_follow_up?: string | null;
  site_plus_code?: string | null;
}

export function useProfessionals() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfessionals = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfessionals(data || []);
    } catch (error: any) {
      console.error("Error fetching professionals:", error);
      toast({
        title: "Error fetching professionals",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addProfessional = async (professional: ProfessionalInsert) => {
    try {
      const { data, error } = await supabase
        .from("professionals")
        .insert([professional])
        .select()
        .single();

      if (error) throw error;

      setProfessionals((prev) => [data, ...prev]);
      toast({ title: "Professional added successfully" });
      return data;
    } catch (error: any) {
      console.error("Error adding professional:", error);
      toast({
        title: "Error adding professional",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateProfessional = async (id: string, updates: Partial<ProfessionalInsert>) => {
    try {
      const { data, error } = await supabase
        .from("professionals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      setProfessionals((prev) =>
        prev.map((p) => (p.id === id ? data : p))
      );
      toast({ title: "Professional updated successfully" });
      return data;
    } catch (error: any) {
      console.error("Error updating professional:", error);
      toast({
        title: "Error updating professional",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteProfessional = async (id: string) => {
    try {
      const { error } = await supabase
        .from("professionals")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setProfessionals((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Professional deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting professional:", error);
      toast({
        title: "Error deleting professional",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchProfessionals();

    const channel = supabase
      .channel("professionals-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "professionals" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setProfessionals((prev) => [payload.new as Professional, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setProfessionals((prev) =>
              prev.map((p) =>
                p.id === (payload.new as Professional).id
                  ? (payload.new as Professional)
                  : p
              )
            );
          } else if (payload.eventType === "DELETE") {
            setProfessionals((prev) =>
              prev.filter((p) => p.id !== (payload.old as Professional).id)
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
    professionals,
    loading,
    addProfessional,
    updateProfessional,
    deleteProfessional,
    refetch: fetchProfessionals,
  };
}
