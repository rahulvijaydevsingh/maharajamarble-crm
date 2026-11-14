import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { realtimeRegistry } from "@/lib/realtimeRegistry";

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
  slot?: "main" | "bulk" | "personal";
  session_key?: string;
  owner_user_id?: string | null;
  owner_name?: string | null;
  label?: string | null;
  qr_payload?: string | null;
  qr_expires_at?: string | null;
  paused?: boolean;
  desired_state?: string;
  [key: string]: unknown;
}

export type WhatsAppSessionAction = "connect" | "disconnect" | "logout" | "refresh_qr" | "pause" | "resume" | "status";
type SessionMap = Record<"main" | "bulk" | "personal", WhatsAppSession | null>;

function toLegacySession(row: any): WhatsAppSession | null {
  if (!row) return null;
  return {
    ...row,
    user_id: row.owner_user_id ?? "",
    instance_name: row.session_key ?? "",
    session_type: row.slot ?? "personal",
    connected_at: row.connected_at ?? null,
    last_active_at: row.last_active_at ?? row.updated_at ?? null,
  } as WhatsAppSession;
}

export function useWhatsAppSession(userId?: string) {
  const auth = useAuth();
  const targetUserId = userId || auth.user?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    if (!auth.user?.id && !userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      let query = (supabase.from("whatsapp_sessions" as any) as any).select("*").order("created_at", { ascending: true });
      if (userId) query = query.eq("owner_user_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      setRows(data ?? []);
    } catch (error) {
      console.error("Error fetching WhatsApp sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [auth.user?.id, userId]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!auth.user?.id) return;
    return realtimeRegistry.subscribe(
      "wa-sessions-" + auth.user.id,
      { event: "*", schema: "public", table: "whatsapp_sessions" },
      () => { void fetchSessions(); },
    );
  }, [auth.user?.id, fetchSessions]);

  const sessionsBySlot = useMemo<SessionMap>(() => {
    const result: SessionMap = { main: null, bulk: null, personal: null };
    for (const row of rows) {
      if (row.slot === "personal" && row.owner_user_id && row.owner_user_id !== targetUserId && !auth.isAdmin()) continue;
      if (row.slot === "main" || row.slot === "bulk") result[row.slot] = toLegacySession(row);
      if (row.slot === "personal" && (!result.personal || row.owner_user_id === targetUserId)) result.personal = toLegacySession(row);
    }
    return result;
  }, [rows, targetUserId, auth]);

  const session = useMemo(() => {
    const personal = sessionsBySlot.personal;
    const main = sessionsBySlot.main;
    return personal?.status === "connected" ? personal : main ?? personal ?? null;
  }, [sessionsBySlot]);

  const triggerSessionAction = useCallback(async (
    action: WhatsAppSessionAction,
    slot: "main" | "bulk" | "personal" = "main",
    extra: Record<string, unknown> = {},
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-session", {
        body: { action, slot, ...extra },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error?.message ?? data?.error ?? "WhatsApp action failed");
      await fetchSessions();
      return { success: true, data: data?.data ?? data };
    } catch (error: any) {
      toast({ title: "WhatsApp action failed", description: error?.message ?? "Request failed.", variant: "destructive" });
      return { success: false, error: error?.message ?? "Request failed" };
    }
  }, [fetchSessions, toast]);

  const createSession = useCallback(async (): Promise<{ qrCode?: string; error?: string }> => {
    const result = await triggerSessionAction("connect", "personal");
    if (!result.success) return { error: result.error };
    return { qrCode: sessionsBySlot.personal?.qr_payload ?? undefined };
  }, [triggerSessionAction, sessionsBySlot.personal]);

  const checkStatus = useCallback(async (): Promise<string> => {
    await fetchSessions();
    return session?.status ?? "disconnected";
  }, [fetchSessions, session?.status]);

  const disconnect = useCallback(async () => {
    await triggerSessionAction("disconnect", "personal");
    toast({ title: "Disconnected", description: "Personal WhatsApp session disconnected." });
  }, [triggerSessionAction, toast]);

  return {
    session,
    loading,
    isLoading: loading,
    isConnected: session?.status === "connected" && !session?.paused,
    qrCode: session?.qr_payload ?? null,
    sessionsBySlot,
    createSession,
    checkStatus,
    disconnect,
    refetch: fetchSessions,
    refreshStatus: fetchSessions,
    connectSession: () => triggerSessionAction("connect", "personal"),
    disconnectSession: () => triggerSessionAction("disconnect", "personal"),
    triggerSessionAction,
  };
}
