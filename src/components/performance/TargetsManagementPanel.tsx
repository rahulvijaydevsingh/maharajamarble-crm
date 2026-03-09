import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Save, Plus, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const DEFAULT_METRICS = [
  { key: "calls_per_week", label: "Calls / Week", period: "weekly", defaultValue: 10 },
  { key: "site_visits_per_week", label: "Site Visits / Week", period: "weekly", defaultValue: 4 },
  { key: "tasks_completion_rate", label: "Task Completion Rate %", period: "monthly", defaultValue: 80 },
  { key: "quotations_sent_per_month", label: "Quotations Sent / Month", period: "monthly", defaultValue: 8 },
  { key: "conversion_rate_min", label: "Conversion Rate % (min)", period: "monthly", defaultValue: 20 },
  { key: "win_rate_min", label: "Win Rate % (min)", period: "monthly", defaultValue: 40 },
  { key: "activity_score_min", label: "Activity Score (min)", period: "monthly", defaultValue: 60 },
  { key: "leads_contacted_rate", label: "Leads Contacted % (min)", period: "weekly", defaultValue: 90 },
];

interface TargetRow {
  id?: string;
  metric_key: string;
  period: string;
  target_value: number;
  staff_id: string | null;
}

interface StaffOption {
  id: string;
  full_name: string;
  email: string;
}

export function TargetsManagementPanel() {
  const { user } = useAuth();
  const [globalTargets, setGlobalTargets] = useState<TargetRow[]>([]);
  const [staffTargets, setStaffTargets] = useState<TargetRow[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (selectedStaffId) fetchStaffTargets(selectedStaffId);
  }, [selectedStaffId]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: globals }, { data: profiles }] = await Promise.all([
      supabase.from("performance_targets" as any).select("*").is("staff_id", null) as any,
      supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    ]);

    const globalMap: Record<string, TargetRow> = {};
    (globals || []).forEach((t: any) => {
      globalMap[t.metric_key] = { id: t.id, metric_key: t.metric_key, period: t.period, target_value: Number(t.target_value), staff_id: null };
    });

    // Fill defaults for missing metrics
    const merged = DEFAULT_METRICS.map(m => globalMap[m.key] || {
      metric_key: m.key, period: m.period, target_value: m.defaultValue, staff_id: null,
    });

    setGlobalTargets(merged);
    setStaffList(profiles || []);
    setLoading(false);
  };

  const fetchStaffTargets = async (staffId: string) => {
    const { data } = await supabase
      .from("performance_targets" as any)
      .select("*")
      .eq("staff_id", staffId) as any;
    setStaffTargets((data || []).map((t: any) => ({
      id: t.id, metric_key: t.metric_key, period: t.period,
      target_value: Number(t.target_value), staff_id: t.staff_id,
    })));
  };

  const updateGlobalValue = (key: string, value: number) => {
    setGlobalTargets(prev => prev.map(t => t.metric_key === key ? { ...t, target_value: value } : t));
  };

  const saveGlobalTargets = async () => {
    setSaving(true);
    try {
      for (const target of globalTargets) {
        if (target.id) {
          await (supabase.from("performance_targets" as any).update({
            target_value: target.target_value, updated_at: new Date().toISOString(),
          } as any).eq("id", target.id) as any);
        } else {
          await (supabase.from("performance_targets" as any).insert({
            metric_key: target.metric_key, period: target.period,
            target_value: target.target_value, staff_id: null, set_by: user?.id,
          } as any) as any);
        }
      }
      toast.success("Global targets saved");
      fetchAll();
    } catch (e) {
      toast.error("Failed to save targets");
    } finally {
      setSaving(false);
    }
  };

  const toggleStaffOverride = async (metricKey: string, useIndividual: boolean) => {
    if (!selectedStaffId) return;
    if (useIndividual) {
      const global = globalTargets.find(g => g.metric_key === metricKey);
      const defaultMeta = DEFAULT_METRICS.find(m => m.key === metricKey);
      await (supabase.from("performance_targets" as any).insert({
        metric_key: metricKey,
        period: global?.period || defaultMeta?.period || "monthly",
        target_value: global?.target_value || defaultMeta?.defaultValue || 0,
        staff_id: selectedStaffId,
        set_by: user?.id,
      } as any) as any);
      toast.success("Individual target created");
    } else {
      const existing = staffTargets.find(t => t.metric_key === metricKey);
      if (existing?.id) {
        await (supabase.from("performance_targets" as any).delete().eq("id", existing.id) as any);
      }
      toast.success("Reverted to global default");
    }
    fetchStaffTargets(selectedStaffId);
  };

  const updateStaffTarget = async (metricKey: string, value: number) => {
    const existing = staffTargets.find(t => t.metric_key === metricKey);
    if (existing?.id) {
      await (supabase.from("performance_targets" as any).update({
        target_value: value, updated_at: new Date().toISOString(),
      } as any).eq("id", existing.id) as any);
      setStaffTargets(prev => prev.map(t => t.metric_key === metricKey ? { ...t, target_value: value } : t));
    }
  };

  const getMetricLabel = (key: string) => DEFAULT_METRICS.find(m => m.key === key)?.label || key;

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading targets...</div>;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
        <Info className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
        <div>
          <span className="font-medium">These targets are used as thresholds in Workflow Automation rules.</span>
          <span className="text-muted-foreground ml-1">Changing a target here automatically updates the automation threshold.</span>
        </div>
      </div>

      {/* Global Defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Global Defaults</CardTitle>
          <CardDescription>Applies to all staff unless individually overridden</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="w-[140px]">Target Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {globalTargets.map(target => (
                <TableRow key={target.metric_key}>
                  <TableCell className="font-medium">{getMetricLabel(target.metric_key)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">{target.period}</Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={target.target_value}
                      onChange={(e) => updateGlobalValue(target.metric_key, Number(e.target.value))}
                      className="w-[100px] h-8"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end mt-4">
            <Button onClick={saveGlobalTargets} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save Global Targets"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Individual Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Overrides</CardTitle>
          <CardDescription>Override global defaults for a specific staff member</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a staff member" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedStaffId && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Global Default</TableHead>
                  <TableHead>Use Individual</TableHead>
                  <TableHead className="w-[140px]">Individual Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEFAULT_METRICS.map(m => {
                  const global = globalTargets.find(g => g.metric_key === m.key);
                  const individual = staffTargets.find(t => t.metric_key === m.key);
                  const hasOverride = !!individual;
                  return (
                    <TableRow key={m.key}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-muted-foreground">{global?.target_value ?? m.defaultValue}</TableCell>
                      <TableCell>
                        <Switch
                          checked={hasOverride}
                          onCheckedChange={(checked) => toggleStaffOverride(m.key, checked)}
                        />
                      </TableCell>
                      <TableCell>
                        {hasOverride ? (
                          <Input
                            type="number"
                            value={individual!.target_value}
                            onChange={(e) => updateStaffTarget(m.key, Number(e.target.value))}
                            className="w-[100px] h-8"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Using global</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
