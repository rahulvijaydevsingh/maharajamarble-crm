import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  MapPin,
  IndianRupee,
  Clock,
  CalendarDays,
  Save,
} from "lucide-react";

interface StaffHRSettingsPanelProps {
  staffId: string;
  staffRole: string | null;
  staffName: string;
}

interface HRSettings {
  base_salary: number;
  salary_type: string;
  work_days: string[];
  shift_start: string;
  shift_end: string;
  overtime_rate: number;
  pf_applicable: boolean;
  salary_effective_from: string;
  gps_mode: string;
  gps_radius_meters: number;
  office_latitude: number | null;
  office_longitude: number | null;
  camera_required: boolean;
}

interface LeaveBalance {
  id: string;
  leave_type: string;
  total_allowed: number;
  used: number;
  remaining: number;
}

const DEFAULT_SETTINGS: HRSettings = {
  base_salary: 0,
  salary_type: "monthly",
  work_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
  shift_start: "09:00",
  shift_end: "18:00",
  overtime_rate: 1.5,
  pf_applicable: false,
  salary_effective_from: "",
  gps_mode: "flexible",
  gps_radius_meters: 100,
  office_latitude: null,
  office_longitude: null,
  camera_required: true,
};

const WORK_DAY_PRESETS: Record<string, string[]> = {
  "mon-fri": ["mon", "tue", "wed", "thu", "fri"],
  "mon-sat": ["mon", "tue", "wed", "thu", "fri", "sat"],
};

const ALL_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const DEFAULT_LEAVE_BALANCES = [
  { leave_type: "sick", total_allowed: 12 },
  { leave_type: "casual", total_allowed: 12 },
  { leave_type: "earned", total_allowed: 15 },
];

export function StaffHRSettingsPanel({ staffId, staffRole, staffName }: StaffHRSettingsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [settings, setSettings] = useState<HRSettings>(DEFAULT_SETTINGS);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveAdjustments, setLeaveAdjustments] = useState<Record<string, { newTotal: number; reason: string }>>({});
  const [workDayPreset, setWorkDayPreset] = useState<string>("mon-sat");

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchData();
  }, [staffId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch HR settings
      const { data: hrData } = await (supabase
        .from("staff_hr_settings" as any)
        .select("*")
        .eq("staff_id", staffId)
        .maybeSingle() as any);

      if (hrData) {
        setIsNew(false);
        setSettings({
          base_salary: hrData.base_salary || 0,
          salary_type: hrData.salary_type || "monthly",
          work_days: hrData.work_days || ["mon", "tue", "wed", "thu", "fri", "sat"],
          shift_start: hrData.shift_start || "09:00",
          shift_end: hrData.shift_end || "18:00",
          overtime_rate: hrData.overtime_rate || 1.5,
          pf_applicable: hrData.pf_applicable ?? false,
          salary_effective_from: hrData.salary_effective_from || "",
          gps_mode: hrData.gps_mode || "flexible",
          gps_radius_meters: hrData.gps_radius_meters || 100,
          office_latitude: hrData.office_latitude,
          office_longitude: hrData.office_longitude,
          camera_required: hrData.camera_required ?? true,
        });
        // Determine preset
        const wd = hrData.work_days || [];
        if (arraysEqual(wd, WORK_DAY_PRESETS["mon-fri"])) setWorkDayPreset("mon-fri");
        else if (arraysEqual(wd, WORK_DAY_PRESETS["mon-sat"])) setWorkDayPreset("mon-sat");
        else setWorkDayPreset("custom");
      }

      // Fetch leave balances
      const { data: leaveData } = await (supabase
        .from("leave_balances" as any)
        .select("*")
        .eq("staff_id", staffId)
        .eq("year", currentYear) as any);

      setLeaveBalances(leaveData || []);
    } catch (err) {
      console.error("Failed to fetch HR settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const upsertData: any = {
        staff_id: staffId,
        base_salary: settings.base_salary,
        salary_type: settings.salary_type,
        work_days: settings.work_days,
        shift_start: settings.shift_start || null,
        shift_end: settings.shift_end || null,
        overtime_rate: settings.overtime_rate,
        pf_applicable: settings.pf_applicable,
        salary_effective_from: settings.salary_effective_from || null,
        gps_mode: settings.gps_mode,
        gps_radius_meters: settings.gps_radius_meters,
        gps_required: settings.gps_mode === "strict",
        office_latitude: settings.office_latitude,
        office_longitude: settings.office_longitude,
        camera_required: settings.camera_required,
      };

      if (isNew) {
        const { error } = await (supabase
          .from("staff_hr_settings" as any)
          .insert(upsertData) as any);
        if (error) throw error;

        // Auto-create leave balances
        const leaveInserts = DEFAULT_LEAVE_BALANCES.map((lb) => ({
          staff_id: staffId,
          year: currentYear,
          leave_type: lb.leave_type,
          total_allowed: lb.total_allowed,
          used: 0,
          remaining: lb.total_allowed,
        }));
        await (supabase.from("leave_balances" as any).insert(leaveInserts) as any);

        setIsNew(false);
      } else {
        const { error } = await (supabase
          .from("staff_hr_settings" as any)
          .update(upsertData)
          .eq("staff_id", staffId) as any);
        if (error) throw error;
      }

      // Process leave adjustments
      for (const [balanceId, adj] of Object.entries(leaveAdjustments)) {
        if (!adj.reason.trim()) continue;
        const balance = leaveBalances.find((b) => b.id === balanceId);
        if (!balance || adj.newTotal === balance.total_allowed) continue;

        const newRemaining = adj.newTotal - balance.used;
        await (supabase
          .from("leave_balances" as any)
          .update({
            total_allowed: adj.newTotal,
            remaining: Math.max(0, newRemaining),
          })
          .eq("id", balanceId) as any);

        // Log adjustment
        await supabase.from("activity_log").insert({
          activity_type: "leave_adjustment",
          activity_category: "hr",
          title: `Leave adjusted for ${staffName}`,
          description: `${balance.leave_type} balance changed from ${balance.total_allowed} to ${adj.newTotal}. Reason: ${adj.reason}`,
          user_name: user?.email || "System",
          user_id: user?.id,
        });
      }

      setLeaveAdjustments({});
      toast({ title: "Saved", description: "HR settings updated successfully" });
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save HR settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Error", description: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) => ({
          ...prev,
          office_latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          office_longitude: parseFloat(pos.coords.longitude.toFixed(6)),
        }));
        toast({ title: "Location set", description: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
      },
      () => toast({ title: "Error", description: "Failed to get location", variant: "destructive" })
    );
  };

  const handleWorkDayPresetChange = (preset: string) => {
    setWorkDayPreset(preset);
    if (preset !== "custom") {
      setSettings((prev) => ({ ...prev, work_days: WORK_DAY_PRESETS[preset] }));
    }
  };

  const toggleDay = (day: string) => {
    setSettings((prev) => ({
      ...prev,
      work_days: prev.work_days.includes(day)
        ? prev.work_days.filter((d) => d !== day)
        : [...prev.work_days, day],
    }));
  };

  const isCameraForced = staffRole === "field_agent";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[70vh]">
      <div className="space-y-6 p-1">
        {/* Salary & Schedule */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IndianRupee className="h-4 w-4" />
            Salary & Schedule
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Base Salary (₹)</Label>
              <Input
                type="number"
                value={settings.base_salary || ""}
                onChange={(e) => setSettings((p) => ({ ...p, base_salary: parseFloat(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Salary Type</Label>
              <Select value={settings.salary_type} onValueChange={(v) => setSettings((p) => ({ ...p, salary_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Working Days</Label>
            <Select value={workDayPreset} onValueChange={handleWorkDayPresetChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mon-fri">Mon – Fri</SelectItem>
                <SelectItem value="mon-sat">Mon – Sat</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {workDayPreset === "custom" && (
              <div className="flex gap-1 flex-wrap mt-2">
                {ALL_DAYS.map((day) => (
                  <Button
                    key={day.value}
                    variant={settings.work_days.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDay(day.value)}
                    className="h-8 px-3"
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Shift Start</Label>
              <Input
                type="time"
                value={settings.shift_start}
                onChange={(e) => setSettings((p) => ({ ...p, shift_start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Shift End</Label>
              <Input
                type="time"
                value={settings.shift_end}
                onChange={(e) => setSettings((p) => ({ ...p, shift_end: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Overtime Rate</Label>
              <Select
                value={String(settings.overtime_rate)}
                onValueChange={(v) => setSettings((p) => ({ ...p, overtime_rate: parseFloat(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="1.5">1.5x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Salary Effective From</Label>
              <Input
                type="date"
                value={settings.salary_effective_from}
                onChange={(e) => setSettings((p) => ({ ...p, salary_effective_from: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>PF Applicable</Label>
            <Switch
              checked={settings.pf_applicable}
              onCheckedChange={(v) => setSettings((p) => ({ ...p, pf_applicable: v }))}
            />
          </div>
        </div>

        <Separator />

        {/* Attendance & Location */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4" />
            Attendance & Location
          </div>

          <div className="space-y-2">
            <Label>GPS Enforcement</Label>
            <Select value={settings.gps_mode} onValueChange={(v) => setSettings((p) => ({ ...p, gps_mode: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict Office</SelectItem>
                <SelectItem value="flexible">Flexible (Log Only)</SelectItem>
                <SelectItem value="exempt">Exempt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings.gps_mode === "strict" && (
            <div className="space-y-2">
              <Label>Location Radius</Label>
              <Select
                value={String(settings.gps_radius_meters)}
                onValueChange={(v) => setSettings((p) => ({ ...p, gps_radius_meters: parseInt(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50m</SelectItem>
                  <SelectItem value="200">200m</SelectItem>
                  <SelectItem value="500">500m</SelectItem>
                  <SelectItem value="1000">1km</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(settings.gps_mode === "strict" || settings.gps_mode === "flexible") && (
            <div className="space-y-2">
              <Label>Office/Base Location</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={settings.office_latitude ?? ""}
                  onChange={(e) => setSettings((p) => ({ ...p, office_latitude: e.target.value ? parseFloat(e.target.value) : null }))}
                />
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={settings.office_longitude ?? ""}
                  onChange={(e) => setSettings((p) => ({ ...p, office_longitude: e.target.value ? parseFloat(e.target.value) : null }))}
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleUseCurrentLocation}>
                <MapPin className="mr-2 h-3 w-3" />
                Use Current Location
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label>Camera Required</Label>
              {isCameraForced && (
                <p className="text-xs text-muted-foreground">Always ON for field agents</p>
              )}
            </div>
            <Switch
              checked={isCameraForced ? true : settings.camera_required}
              onCheckedChange={(v) => setSettings((p) => ({ ...p, camera_required: v }))}
              disabled={isCameraForced}
            />
          </div>
        </div>

        <Separator />

        {/* Leave Allocation */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" />
            Leave Allocation ({currentYear})
          </div>

          {leaveBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isNew
                ? "Leave balances will be auto-created when you save (Sick: 12, Casual: 12, Earned: 15)."
                : "No leave balances found for this year."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Allowed</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Adjust To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveBalances.map((lb) => {
                  const adj = leaveAdjustments[lb.id];
                  return (
                    <TableRow key={lb.id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{lb.leave_type}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{lb.total_allowed}</TableCell>
                      <TableCell className="text-center">{lb.used}</TableCell>
                      <TableCell className="text-center">{lb.remaining}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          className="w-16 h-8 text-center mx-auto"
                          value={adj?.newTotal ?? lb.total_allowed}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setLeaveAdjustments((prev) => ({
                              ...prev,
                              [lb.id]: { newTotal: val, reason: prev[lb.id]?.reason || "" },
                            }));
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {Object.entries(leaveAdjustments).some(([id, adj]) => {
            const bal = leaveBalances.find((b) => b.id === id);
            return bal && adj.newTotal !== bal.total_allowed;
          }) && (
            <div className="space-y-2">
              <Label>Adjustment Reason (required)</Label>
              <Textarea
                placeholder="Reason for leave balance adjustment..."
                value={Object.values(leaveAdjustments)[0]?.reason || ""}
                onChange={(e) => {
                  const reason = e.target.value;
                  setLeaveAdjustments((prev) => {
                    const updated = { ...prev };
                    for (const id of Object.keys(updated)) {
                      updated[id] = { ...updated[id], reason };
                    }
                    return updated;
                  });
                }}
              />
            </div>
          )}
        </div>

        <Separator />

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save HR Settings
        </Button>
      </div>
    </ScrollArea>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
