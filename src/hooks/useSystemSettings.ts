import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface SystemSettings {
  id?: string;
  default_reminders_enabled: boolean;
  hr_module_enabled?: boolean;
}

/**
 * Lightweight hook for global system_settings (singleton row).
 * Exposes the `default_reminders_enabled` toggle used by task/calendar create dialogs.
 */
export function useSystemSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings>({ default_reminders_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await (supabase
        .from("system_settings" as any)
        .select("id, default_reminders_enabled, hr_module_enabled")
        .limit(1)
        .maybeSingle() as any);
      if (error) throw error;
      if (data) setSettings(data as SystemSettings);
    } catch (err) {
      console.error("Failed to fetch system_settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchSettings();

    const channel = supabase
      .channel("system-settings-global")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload: any) => {
          if (payload.new) setSettings((prev) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchSettings]);

  const setDefaultRemindersEnabled = async (enabled: boolean) => {
    setSaving(true);
    try {
      // Ensure a settings row exists
      let rowId = settings.id;
      if (!rowId) {
        const { data: existing } = await (supabase
          .from("system_settings" as any)
          .select("id")
          .limit(1)
          .maybeSingle() as any);
        rowId = existing?.id;
      }

      if (rowId) {
        const { error } = await (supabase
          .from("system_settings" as any)
          .update({ default_reminders_enabled: enabled })
          .eq("id", rowId) as any);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase
          .from("system_settings" as any)
          .insert({ default_reminders_enabled: enabled })
          .select("id")
          .single() as any);
        if (error) throw error;
        rowId = data?.id;
      }

      setSettings((prev) => ({ ...prev, id: rowId, default_reminders_enabled: enabled }));
      toast({ title: `Default reminders ${enabled ? "enabled" : "disabled"}` });
    } catch (err: any) {
      toast({
        title: "Failed to update setting",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    defaultRemindersEnabled: settings.default_reminders_enabled,
    loading,
    saving,
    setDefaultRemindersEnabled,
    refetch: fetchSettings,
  };
}
