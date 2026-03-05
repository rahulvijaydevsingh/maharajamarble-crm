import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logToStaffActivity } from "@/lib/staffActivityLogger";

export interface DeletedLead {
  id: string;
  name: string;
  phone: string;
  assigned_to: string;
  deleted_at: string;
  deleted_by: string | null;
  status: string;
  previous_status: string | null;
  priority: number;
  source: string;
  created_at: string;
}

export function useDeletedLeads() {
  const [deletedLeads, setDeletedLeads] = useState<DeletedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDeletedLeads = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, assigned_to, deleted_at, deleted_by, status, previous_status, priority, source, created_at")
        .eq("status", "deleted")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setDeletedLeads(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching deleted leads",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const softDeleteLead = async (leadId: string, leadName: string) => {
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;

      // Get open task count
      const { count } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .in("status", ["Pending", "In Progress", "Overdue"]);

      // Get current lead status to save as previous_status
      const { data: currentLead } = await supabase
        .from("leads")
        .select("status")
        .eq("id", leadId)
        .single();

      // Soft delete the lead
      const { error } = await supabase
        .from("leads")
        .update({
          status: "deleted",
          deleted_at: new Date().toISOString(),
          deleted_by: userId || null,
          previous_status: currentLead?.status || "new",
        })
        .eq("id", leadId);

      if (error) throw error;

      // Suspend all open tasks linked to this lead
      if (count && count > 0) {
        await supabase
          .from("tasks")
          .update({
            suspended_at: new Date().toISOString(),
            suspension_reason: "Lead deleted — moved to Recycle Bin",
          })
          .eq("lead_id", leadId)
          .in("status", ["Pending", "In Progress", "Overdue"]);
      }

      // Log activity
      try {
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity(
            "delete_lead",
            u.email || "",
            u.id,
            `Moved lead to Recycle Bin: ${leadName} (${count || 0} tasks suspended)`,
            "lead",
            leadId
          );
        }
      } catch (_) {}

      toast({ title: "Lead moved to Recycle Bin" });
      return { taskCount: count || 0 };
    } catch (error: any) {
      toast({
        title: "Error deleting lead",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const restoreLead = async (leadId: string, leadName: string) => {
    try {
      // Get previous status
      const { data: lead } = await supabase
        .from("leads")
        .select("previous_status")
        .eq("id", leadId)
        .single();

      const restoreStatus = lead?.previous_status || "new";

      const { error } = await supabase
        .from("leads")
        .update({
          status: restoreStatus,
          deleted_at: null,
          deleted_by: null,
          previous_status: null,
        })
        .eq("id", leadId);

      if (error) throw error;

      // Reactivate suspended tasks
      await supabase
        .from("tasks")
        .update({
          suspended_at: null,
          suspension_reason: null,
        })
        .eq("lead_id", leadId)
        .not("suspended_at", "is", null);

      // Log activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity(
            "restore_lead",
            u.email || "",
            u.id,
            `Restored lead from Recycle Bin: ${leadName} → ${restoreStatus}`,
            "lead",
            leadId
          );
        }
      } catch (_) {}

      toast({ title: "Lead restored successfully" });
      fetchDeletedLeads();
    } catch (error: any) {
      toast({
        title: "Error restoring lead",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const permanentlyDeleteLead = async (leadId: string, leadName: string) => {
    try {
      // Delete all tasks linked to this lead
      await supabase.from("tasks").delete().eq("lead_id", leadId);
      // Delete all activity log entries for this lead
      await supabase.from("activity_log").delete().eq("lead_id", leadId);
      // Delete the lead permanently
      const { error } = await supabase.from("leads").delete().eq("id", leadId);

      if (error) throw error;

      // Log activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity(
            "permanent_delete_lead",
            u.email || "",
            u.id,
            `Permanently deleted lead: ${leadName}`,
            "lead",
            leadId
          );
        }
      } catch (_) {}

      toast({ title: "Lead permanently deleted" });
      setDeletedLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (error: any) {
      toast({
        title: "Error permanently deleting lead",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchDeletedLeads();
  }, []);

  return {
    deletedLeads,
    loading,
    softDeleteLead,
    restoreLead,
    permanentlyDeleteLead,
    refetch: fetchDeletedLeads,
  };
}
