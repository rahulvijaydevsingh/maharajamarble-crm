import React, { useState, useEffect, useMemo } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  MapPin,
  IndianRupee,
  Clock,
  CalendarDays,
  Save,
  ShieldCheck,
  Trash2,
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
  store_photos: boolean;
  store_location: boolean;
  photo_retention_days: number;
  location_retention_days: number;
}

interface LeaveBalance {
  id: string;
  leave_type: string;
  total_allowed: number;
  used: number;
  remaining: number;
}

interface RetentionCandidate {
  record_id: string;
  attendance_date: string;
  data_type: "photos" | "location";
  photo_file_paths: string[];
  retention_days: number;
}

interface RetentionPurgeReport {
  dataType: "photos" | "location";
  completedCount: number;
  pendingRecords: Array<{ attendanceDate: string; reason: string }>;
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
  store_photos: true,
  store_location: true,
  photo_retention_days: 90,
  location_retention_days: 30,
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
  const [retentionCandidates, setRetentionCandidates] = useState<RetentionCandidate[]>([]);
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [retentionLoaded, setRetentionLoaded] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<"photos" | "location" | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeReport, setPurgeReport] = useState<RetentionPurgeReport | null>(null);

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
          store_photos: hrData.store_photos ?? true,
          store_location: hrData.store_location ?? true,
          photo_retention_days: hrData.photo_retention_days || 90,
          location_retention_days: hrData.location_retention_days || 30,
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

  const fetchRetentionCandidates = async () => {
    setLoadingRetention(true);
    try {
      const { data, error } = await supabase.rpc("get_attendance_retention_candidates", {
        p_staff_id: staffId,
      });
      if (error) throw error;
      setRetentionCandidates((data || []) as RetentionCandidate[]);
      setPurgeReport(null);
      setRetentionLoaded(true);
    } catch (err: any) {
      toast({
        title: "Could not review retained data",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingRetention(false);
    }
  };

  const retentionGroups = useMemo(() => ({
    photos: retentionCandidates.filter((candidate) => candidate.data_type === "photos"),
    location: retentionCandidates.filter((candidate) => candidate.data_type === "location"),
  }), [retentionCandidates]);

  const confirmPurge = async () => {
    if (!purgeTarget) return;
    const records = retentionGroups[purgeTarget];
    if (records.length === 0) {
      setPurgeTarget(null);
      return;
    }

    setPurging(true);
    try {
      const pendingRecords: RetentionPurgeReport["pendingRecords"] = [];
      let recordIdsReadyToClear = records.map((record) => record.record_id);

      if (purgeTarget === "photos") {
        recordIdsReadyToClear = [];

        // Keep each database reference until every associated file has been removed.
        // This intentionally works record-by-record so a failed deletion can be retried safely.
        for (const record of records) {
          const paths = record.photo_file_paths.filter(Boolean);
          if (paths.length === 0) {
            pendingRecords.push({
              attendanceDate: record.attendance_date,
              reason: "No storage path was available, so the record was left unchanged.",
            });
            continue;
          }

          const { error: storageError } = await supabase.storage
            .from("attendance-photos")
            .remove(paths);

          if (storageError) {
            pendingRecords.push({
              attendanceDate: record.attendance_date,
              reason: storageError.message || "The photo file could not be removed from storage.",
            });
            continue;
          }

          recordIdsReadyToClear.push(record.record_id);
        }
      }

      let clearedCount = 0;
      if (recordIdsReadyToClear.length > 0) {
        const { data: cleared, error } = await supabase.rpc("clear_attendance_retention_data", {
          p_record_ids: recordIdsReadyToClear,
          p_data_type: purgeTarget,
        });
        if (error) throw error;
        clearedCount = cleared?.length || 0;
      }

      const report: RetentionPurgeReport = {
        dataType: purgeTarget,
        completedCount: clearedCount,
        pendingRecords,
      };
      setPurgeReport(report);

      if (clearedCount === 0 && pendingRecords.length === 0) {
        toast({
          title: "Nothing removed",
          description: "The selected data is no longer eligible under the current retention settings.",
        });
      } else {
        toast({
          title: pendingRecords.length > 0 ? "Retention cleanup partially complete" : "Retention cleanup complete",
          description: `${clearedCount} ${purgeTarget === "photos" ? "photo" : "location"} record${clearedCount === 1 ? "" : "s"} cleared.${pendingRecords.length > 0 ? ` ${pendingRecords.length} record${pendingRecords.length === 1 ? " remains" : "s remain"} available to retry.` : " Attendance history was preserved."}`,
          variant: pendingRecords.length > 0 ? "destructive" : "default",
        });
      }
      await fetchRetentionCandidates();
    } catch (err: any) {
      toast({
        title: "Retention cleanup failed",
        description: err.message || "No attendance history was changed.",
        variant: "destructive",
      });
    } finally {
      setPurging(false);
      setPurgeTarget(null);
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
        store_photos: settings.store_photos,
        store_location: settings.store_location,
        photo_retention_days: settings.photo_retention_days,
        location_retention_days: settings.location_retention_days,
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

          <div className="flex items-center justify-between">
            <div>
              <Label>Store Attendance Photos</Label>
              <p className="text-xs text-muted-foreground">Keep clock-in and clock-out photos for this staff member</p>
            </div>
            <Switch
              checked={settings.store_photos}
              onCheckedChange={(v) => setSettings((p) => ({ ...p, store_photos: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Store Attendance Location</Label>
              <p className="text-xs text-muted-foreground">Keep clock-in and clock-out coordinates for this staff member</p>
            </div>
            <Switch
              checked={settings.store_location}
              onCheckedChange={(v) => setSettings((p) => ({ ...p, store_location: v }))}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Photo Retention (days)</Label>
              <Input
                type="number"
                min={30}
                max={3650}
                value={settings.photo_retention_days}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  setSettings((p) => ({
                    ...p,
                    photo_retention_days: Number.isFinite(value) && value >= 30 ? value : 30,
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Location Retention (days)</Label>
              <Input
                type="number"
                min={30}
                max={3650}
                value={settings.location_retention_days}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  setSettings((p) => ({
                    ...p,
                    location_retention_days: Number.isFinite(value) && value >= 30 ? value : 30,
                  }));
                }}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A minimum of 30 days is enforced. Data is never removed automatically.
          </p>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" /> Retention review
                </div>
                <p className="text-xs text-muted-foreground">
                  Review eligible data before permanently removing only photo files or GPS coordinates. Attendance times, status, and payroll values remain intact.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={fetchRetentionCandidates} disabled={loadingRetention}>
                {loadingRetention ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review data"}
              </Button>
            </div>

            {retentionLoaded && (
              <div className="space-y-2">
                {(["photos", "location"] as const).map((dataType) => {
                  const records = retentionGroups[dataType];
                  const label = dataType === "photos" ? "attendance photos" : "GPS location records";
                  const retentionDays = records[0]?.retention_days ?? (dataType === "photos" ? settings.photo_retention_days : settings.location_retention_days);
                  return (
                    <div key={dataType} className="flex items-center justify-between gap-3 border p-3 text-sm">
                      <div>
                        <p className="font-medium">{records.length} {label} eligible</p>
                        <p className="text-xs text-muted-foreground">Older than {retentionDays} days</p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={records.length === 0}
                        onClick={() => setPurgeTarget(dataType)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </Button>
                    </div>
                  );
                })}
                {retentionCandidates.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Eligible dates: {Array.from(new Set(retentionCandidates.map((candidate) => candidate.attendance_date))).sort().join(", ")}
                  </p>
                )}
              </div>
            )}
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
      <AlertDialog open={purgeTarget !== null} onOpenChange={(open) => !open && !purging && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm retention cleanup</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {purgeTarget === "photos" ? "stored attendance photos" : "stored GPS coordinates"} from {purgeTarget ? retentionGroups[purgeTarget].length : 0} eligible attendance record(s) for {staffName}. Attendance dates, clock times, status, hours, notes, and payroll data will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPurge} disabled={purging} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {purging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Permanently remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
