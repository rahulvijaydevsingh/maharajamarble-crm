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
  can_send?: boolean;
  [key: string]: unknown;
}

export type WhatsAppSessionAction =
  | "connect"
  | "disconnect"
  | "logout"
  | "refresh_qr"
  | "pause"
  | "resume"
  | "status";
type SessionMap = Record<"main" | "bulk" | "personal", WhatsAppSession | null>;

function toLegacySession(row: any): WhatsAppSession | null {
  if (!row) return null;
  return {
    ...row,
    user_id: row.owner_user_id ?? "",
    instance_name: row.session_key ?? row.slot ?? "",
    session_type: row.slot ?? "personal",
    connected_at: row.connected_at ?? row.last_connected_at ?? null,
    last_active_at: row.last_active_at ?? row.updated_at ?? null,
  } as WhatsAppSession;
}

async function extractFunctionErrorMessage(error: any, fallback: string): Promise<string> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (body?.error?.message) return String(body.error.message);
      if (typeof body?.error === "string") return body.error;
    }
  } catch {
    // Ignore JSON parse failure
  }
  return error?.message ?? fallback;
}

export function useWhatsAppSession(userId?: string) {
  const auth = useAuth();
  const targetUserId = userId || auth.user?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [slotSummary, setSlotSummary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    if (!auth.user?.id && !userId) {
      setRows([]);
      setSlotSummary(null);
      setLoading(false);
      return;
    }
    try {
      const [sessionsRes, slotRes] = await Promise.all([
        (supabase.from("whatsapp_sessions" as any) as any)
          .select("*")
          .order("created_at", { ascending: true }),
        (supabase.rpc as any)("wa_slot_status"),
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      const visible = (sessionsRes.data ?? []).filter(
        (row: { slot?: string; owner_user_id?: string | null }) =>
          !userId || row.slot !== "personal" || row.owner_user_id === userId,
      );
      setRows(visible);
      if (!slotRes.error && slotRes.data?.slots) {
        setSlotSummary(slotRes.data.slots);
      }
    } catch (error) {
      console.error("Error fetching WhatsApp sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [auth.user?.id, userId]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!auth.user?.id) return;
    return realtimeRegistry.subscribe(
      "wa-sessions-" + auth.user.id,
      { event: "*", schema: "public", table: "whatsapp_sessions" },
      () => {
        void fetchSessions();
      },
    );
  }, [auth.user?.id, fetchSessions]);

  const sessionsBySlot = useMemo<SessionMap>(() => {
    const result: SessionMap = { main: null, bulk: null, personal: null };
    for (const row of rows) {
      if (row.slot === "personal" && row.owner_user_id && row.owner_user_id !== targetUserId && !auth.isAdmin()) {
        continue;
      }
      if (row.slot === "main" || row.slot === "bulk") {
        result[row.slot] = toLegacySession({
          ...row,
          can_send: slotSummary?.[row.slot]?.can_send ?? auth.isAdmin(),
        });
      }
      if (row.slot === "personal" && (!result.personal || row.owner_user_id === targetUserId)) {
        result.personal = toLegacySession({
          ...row,
          can_send: slotSummary?.personal?.can_send ?? auth.isAdmin(),
        });
      }
    }

    // Fallback to wa_slot_status() for non-admin staff whose RLS hides company whatsapp_sessions rows (C2)
    for (const slotKey of ["main", "bulk"] as const) {
      if (!result[slotKey] && slotSummary?.[slotKey]) {
        const s = slotSummary[slotKey];
        result[slotKey] = toLegacySession({
          id: s.session_id ?? slotKey,
          slot: slotKey,
          session_key: slotKey,
          label: s.label,
          status: s.can_send ? s.status : "disconnected",
          paused: Boolean(s.paused),
          connected_at: s.last_connected_at ?? null,
          phone_number: s.status === "connected" ? s.label ?? "Company WhatsApp" : null,
          can_send: Boolean(s.can_send),
        });
      }
    }

    return result;
  }, [rows, slotSummary, targetUserId, auth]);

  const session = useMemo(() => {
    const personal = sessionsBySlot.personal;
    const main = sessionsBySlot.main;
    if (personal?.status === "connected" && !personal?.paused) return personal;
    if (main?.can_send !== false && main) return main;
    return personal ?? main ?? null;
  }, [sessionsBySlot]);

  const triggerSessionAction = useCallback(
    async (
      action: WhatsAppSessionAction,
      slot: "main" | "bulk" | "personal" = "main",
      extra: Record<string, unknown> = {},
    ) => {
      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-session", {
          body: { action, slot, ...extra },
        });
        if (error) {
          const msg = await extractFunctionErrorMessage(error, "WhatsApp session request failed.");
          throw new Error(msg);
        }
        if (data?.ok === false) {
          throw new Error(data?.error?.message ?? data?.error ?? "WhatsApp action failed");
        }
        await fetchSessions();
        return { success: true, data: data?.data ?? data };
      } catch (error: any) {
        const message = error?.message ?? "Request failed";
        toast({ title: "WhatsApp action failed", description: message, variant: "destructive" });
        return { success: false, error: message };
      }
    },
    [fetchSessions, toast],
  );

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