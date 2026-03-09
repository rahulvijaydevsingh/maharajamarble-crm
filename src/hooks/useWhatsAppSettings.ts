import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface WhatsAppSettings {
  id: string;
  module_enabled: boolean;
  evolution_api_url: string | null;
  daily_limit_main: number;
  daily_limit_bulk: number;
  delay_between_msgs_seconds: number;
  bulk_instance_name: string | null;
  auto_send_quotations: boolean;
  auto_send_reminders: boolean;
  updated_at: string;
}

export function useWhatsAppSettings() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching WhatsApp settings:", error);
    } else {
      setSettings(data as unknown as WhatsAppSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<WhatsAppSettings>) => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("whatsapp_settings")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", settings.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save WhatsApp settings", variant: "destructive" });
    } else {
      setSettings({ ...settings, ...updates } as WhatsAppSettings);
      toast({ title: "Saved", description: "WhatsApp settings updated" });
    }
    setSaving(false);
  };

  return { settings, loading, saving, updateSettings, refetch: fetchSettings };
}
