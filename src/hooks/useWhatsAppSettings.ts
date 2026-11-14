import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export interface WhatsAppSettings {
  id: string;
  module_enabled: boolean;
  kill_switch?: boolean;
  allow_shared_slots?: boolean;
  daily_limit_main: number;
  daily_limit_bulk: number;
  delay_between_msgs_seconds: number;
  auto_send_quotations: boolean;
  auto_send_reminders: boolean;
  updated_at: string;
  updated_by?: string;
  pace_min_seconds?: number;
  pace_max_seconds?: number;
  main_new_recipient_cap?: number;
  bulk_new_recipient_cap?: number;
  business_hours_start?: string;
  business_hours_end?: string;
  bulk_business_hours_only?: boolean;
  warmup_enabled?: boolean;
  max_consecutive_failures?: number;
  gateway_offline_after_seconds?: number;
  showroom_name?: string | null;
  showroom_address?: string | null;
  showroom_lat?: number | null;
  showroom_lng?: number | null;
  showroom_maps_url?: string | null;
  evolution_api_url?: string | null;
  bulk_instance_name?: string | null;
  [key: string]: unknown;
}

export function useWhatsAppSettings() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [slotStatus, setSlotStatus] = useState<Record<string, any> | null>(null);
  const [workerInstances, setWorkerInstances] = useState<Record<string, any>[]>([]);
  const [isGatewayOnline, setIsGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();
  const admin = Boolean(auth.isAdmin());

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      let row: any = null;
      if (admin) {
        const result = await (supabase.from("whatsapp_settings" as any) as any)
          .select("*").limit(1).maybeSingle();
        if (!result.error) row = result.data;
      }
      if (!row) {
        const result = await (supabase.from("whatsapp_settings_public" as any) as any)
          .select("*").limit(1).maybeSingle();
        if (result.error) throw result.error;
        row = result.data;
      }
      setSettings(row ? row as WhatsAppSettings : null);

      const [slotResult, workerResult] = await Promise.all([
        (supabase.rpc as any)("wa_slot_status"),
        admin
          ? (supabase.from("whatsapp_worker_instances" as any) as any).select("*").order("last_seen_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!slotResult.error) setSlotStatus(slotResult.data ?? null);
      if (admin && !workerResult.error) {
        const workers = (workerResult.data ?? []) as Record<string, any>[];
        setWorkerInstances(workers);
        const threshold = Number(row?.gateway_offline_after_seconds ?? 180);
        const now = Date.now();
        setIsGatewayOnline(workers.some((worker) => {
          const lastSeen = new Date(worker.last_seen_at).getTime();
          return Number.isFinite(lastSeen) && now - lastSeen <= threshold * 1000;
        }));
      } else {
        setWorkerInstances([]);
        setIsGatewayOnline(false);
      }
    } catch (error) {
      console.error("Error fetching WhatsApp settings:", error);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const updateSettings = async (updates: Partial<WhatsAppSettings>): Promise<boolean> => {
    if (!settings || !admin) return false;
    const fullName = auth.profile?.full_name?.trim() ?? "";
    if (!fullName || fullName.includes("@") || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(fullName)) {
      toast({ title: "Profile name required", description: "Set a valid staff full name before updating WhatsApp settings.", variant: "destructive" });
      return false;
    }
    setSaving(true);
    try {
      const { error } = await (supabase.from("whatsapp_settings" as any) as any)
        .update({ ...updates, updated_by: fullName, updated_by_user_id: auth.user?.id ?? null, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
      setSettings({ ...settings, ...updates, updated_by: fullName });
      toast({ title: "Saved", description: "WhatsApp settings updated." });
      return true;
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message ?? "Could not update WhatsApp settings.", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { settings, slotStatus, workerInstances, isGatewayOnline, loading, saving, updateSettings, refetch: fetchSettings, isAdmin: admin };
}
