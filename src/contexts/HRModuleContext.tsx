import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface HRModuleContextType {
  hrEnabled: boolean;
  loading: boolean;
}

const HRModuleContext = createContext<HRModuleContextType>({
  hrEnabled: false,
  loading: true,
});

export function HRModuleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hrEnabled, setHrEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHrEnabled(false);
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const { data, error } = await (supabase
          .from("system_settings" as any)
          .select("hr_module_enabled")
          .limit(1)
          .single() as any);

        if (error) throw error;
        setHrEnabled(data?.hr_module_enabled ?? false);
      } catch (err) {
        console.error("Failed to fetch HR module setting:", err);
        setHrEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();

    // Realtime subscription so toggle reflects instantly for all users
    const channel = supabase
      .channel("system-settings-hr")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload: any) => {
          if (payload.new?.hr_module_enabled !== undefined) {
            setHrEnabled(payload.new.hr_module_enabled);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <HRModuleContext.Provider value={{ hrEnabled, loading }}>
      {children}
    </HRModuleContext.Provider>
  );
}

export function useHRModule() {
  return useContext(HRModuleContext);
}
