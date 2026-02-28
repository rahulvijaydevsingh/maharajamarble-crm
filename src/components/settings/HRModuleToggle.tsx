import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useHRModule } from "@/contexts/HRModuleContext";
import { toast } from "sonner";
import { format } from "date-fns";

export function HRModuleToggle() {
  const { user, profile, role } = useAuth();
  const { hrEnabled } = useHRModule();
  const [toggling, setToggling] = useState(false);
  const [toggledAt, setToggledAt] = useState<string | null>(null);
  const [toggledByName, setToggledByName] = useState<string | null>(null);

  const isAdminRole = role === "super_admin" || role === "admin";

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const { data } = await (supabase
          .from("system_settings" as any)
          .select("hr_module_toggled_at, hr_module_toggled_by")
          .limit(1)
          .single() as any);

        if (data?.hr_module_toggled_at) {
          setToggledAt(data.hr_module_toggled_at);
        }
        if (data?.hr_module_toggled_by) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", data.hr_module_toggled_by)
            .single();
          setToggledByName(prof?.full_name || null);
        }
      } catch {
        // ignore
      }
    };
    fetchMeta();
  }, [hrEnabled]);

  const handleToggle = async () => {
    if (!user || !isAdminRole) return;
    setToggling(true);
    try {
      const newValue = !hrEnabled;

      // Get the single settings row id
      const { data: settings } = await (supabase
        .from("system_settings" as any)
        .select("id")
        .limit(1)
        .single() as any);

      if (!settings?.id) throw new Error("System settings not found");

      const { error } = await (supabase
        .from("system_settings" as any)
        .update({
          hr_module_enabled: newValue,
          hr_module_toggled_by: user.id,
          hr_module_toggled_at: new Date().toISOString(),
        } as any)
        .eq("id", settings.id) as any);

      if (error) throw error;

      // Log to activity_log
      await supabase.from("activity_log").insert({
        activity_type: "system_setting_changed",
        activity_category: "system",
        title: `HR Module ${newValue ? "enabled" : "disabled"} by ${profile?.full_name || profile?.email || "Admin"}`,
        user_id: user.id,
        user_name: profile?.full_name || profile?.email || "Admin",
        metadata: { setting: "hr_module_enabled", value: newValue },
      });

      toast.success(`HR Module ${newValue ? "enabled" : "disabled"}`);
    } catch (err: any) {
      console.error("Failed to toggle HR module:", err);
      toast.error("Failed to toggle HR module");
    } finally {
      setToggling(false);
    }
  };

  if (!isAdminRole) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          HR Module — Attendance, Leave & Payroll
        </CardTitle>
        <CardDescription>
          Enables staff attendance tracking with GPS verification, leave management, salary calculation, and work delegation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hrEnabled ? (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                Module Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                Module Disabled
              </Badge>
            )}
            {hrEnabled && toggledAt && (
              <span className="text-xs text-muted-foreground">
                Enabled {format(new Date(toggledAt), "PPp")}
                {toggledByName && ` by ${toggledByName}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {toggling && <Loader2 className="h-4 w-4 animate-spin" />}
            <Switch
              checked={hrEnabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              className="scale-125"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
