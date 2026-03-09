import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface WhatsAppSession {
  id: string;
  user_id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  session_type: string;
  connected_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export function useWhatsAppSession(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSession = useCallback(async () => {
    if (!targetUserId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("user_id", targetUserId)
      .limit(1)
      .maybeSingle();

    if (error) console.error("Error fetching WA session:", error);
    setSession(data as unknown as WhatsAppSession | null);
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  const createSession = async (): Promise<{ qrCode?: string; error?: string }> => {
    if (!targetUserId) return { error: "No user ID" };
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-create-session", {
        body: { userId: targetUserId },
      });
      if (error) throw error;
      if (data?.error) return { error: data.error };
      await fetchSession();
      return { qrCode: data?.qrCode };
    } catch (err: any) {
      return { error: err.message || "Failed to create session" };
    }
  };

  const checkStatus = async (): Promise<string> => {
    if (!session) return "disconnected";
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-session-status", {
        body: { instanceName: session.instance_name },
      });
      if (error) throw error;
      const newStatus = data?.status || "disconnected";
      if (newStatus !== session.status) {
        await supabase
          .from("whatsapp_sessions")
          .update({
            status: newStatus,
            ...(newStatus === "connected" ? {
              connected_at: new Date().toISOString(),
              last_active_at: new Date().toISOString(),
              phone_number: data?.phoneNumber || null,
            } : {}),
          } as any)
          .eq("id", session.id);
        await fetchSession();
      }
      return newStatus;
    } catch {
      return "disconnected";
    }
  };

  const disconnect = async () => {
    if (!session) return;
    try {
      await supabase.functions.invoke("whatsapp-create-session", {
        body: { userId: targetUserId, action: "disconnect", instanceName: session.instance_name },
      });
      await supabase
        .from("whatsapp_sessions")
        .update({ status: "disconnected", connected_at: null } as any)
        .eq("id", session.id);
      await fetchSession();
      toast({ title: "Disconnected", description: "WhatsApp session disconnected" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return { session, loading, createSession, checkStatus, disconnect, refetch: fetchSession };
}
