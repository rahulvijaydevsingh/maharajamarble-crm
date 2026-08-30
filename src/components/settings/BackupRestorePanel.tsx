import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCrmBackups, type BackupModuleKey, type RestoreProgress } from "@/hooks/useCrmBackups";
import { useBackupJobs } from "@/hooks/useBackupJobs";
import type { BackupJobRow } from "@/contexts/BackupJobsContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  FileUp,
  Loader2,
  Package,
  ChevronDown,
  ShieldAlert,
  AlertCircle,
  Pin,
  Trash2,
  Eye,
  Save,
  Clock,
  HardDrive,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const MODULES: Array<{ key: BackupModuleKey; label: string; description: string }> = [
  { key: "leads", label: "Leads", description: "Leads + activity" },
  { key: "customers", label: "Customers", description: "Customers + activity" },
  { key: "professionals", label: "Professionals", description: "Professionals" },
  { key: "tasks", label: "Tasks", description: "Tasks + subtasks + logs" },
  { key: "reminders", label: "Reminders", description: "Reminders" },
  { key: "quotations", label: "Quotations", description: "Quotations + items + attachments" },
  { key: "automation", label: "Automation", description: "Rules, templates, executions" },
  { key: "communication", label: "Communication", description: "Messages + announcements" },
  { key: "users_access", label: "Users & Access", description: "Profiles + roles + permissions" },
  { key: "company_system", label: "Company & System", description: "Company settings, control panel, filters" },
  { key: "todo", label: "Todo Lists", description: "Todo lists and items" },
  { key: "attachments_files", label: "Attachments/Files", description: "Attachment metadata + stored objects" },
  { key: "kit", label: "Keep in Touch", description: "KIT subscriptions, touches, presets" },
  { key: "performance", label: "Performance", description: "Targets, notes, widget prefs" },
  { key: "staff_logs", label: "Staff Activity Logs", description: "Staff activity log + notifications" },
  { key: "whatsapp", label: "WhatsApp", description: "Settings, sessions, messages, queue" },
  { key: "hr_attendance", label: "HR & Attendance", description: "Attendance logs, clock-in/out history, and leave tracking" },
  { key: "api_access", label: "API Access", description: "API keys and rate limits" },
];

const ALL_MODULE_KEYS = MODULES.map((m) => m.key);

function statusBadge(status: BackupJobRow["status"]) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "processing":
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </Badge>
      );
    case "completed":
      return <Badge className="bg-green-600 hover:bg-green-700">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "pruned":
      return <Badge variant="outline">Archived</Badge>;
    case "manually_deleted":
      return <Badge variant="destructive">Deleted</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function integrityBadge(integrityStatus: BackupJobRow["integrity_status"]) {
  switch (integrityStatus) {
    case "valid":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Integrity: Valid</Badge>;
    case "failed":
      return <Badge variant="destructive">Integrity: Failed</Badge>;
    default:
      return null;
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || isNaN(bytes)) return "N/A";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function openSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from("crm-backups").createSignedUrl(path, 3600);
  if (error || !data) return;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

type DryRunCandidate = {
  id: string;
  tier: string;
  created_at: string;
  total_size_bytes?: number | null;
};

type RetentionSettings = {
  daily_keep: number;
  weekly_keep: number;
  monthly_keep: number;
  is_enabled: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

function RetentionSettingsSection({
  onDryRun,
  onRunRetention,
  runningRetention,
}: {
  onDryRun: () => void;
  onRunRetention: () => void;
  runningRetention: boolean;
}) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<RetentionSettings>({
    daily_keep: 7,
    weekly_keep: 4,
    monthly_keep: 6,
    is_enabled: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("backup_retention_settings" as any)
        .select("*")
        .eq("id", true)
        .single();

      if (cancelled) return;
      if (!error && data) {
        setSettings({
          daily_keep: data.daily_keep ?? 7,
          weekly_keep: data.weekly_keep ?? 4,
          monthly_keep: data.monthly_keep ?? 6,
          is_enabled: data.is_enabled ?? true,
          updated_at: data.updated_at,
          updated_by: data.updated_by,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const updatedBy = profile?.full_name || user?.email || "Unknown";
    const { error } = await supabase
      .from("backup_retention_settings" as any)
      .upsert({
        id: true,
        daily_keep: Number(settings.daily_keep),
        weekly_keep: Number(settings.weekly_keep),
        monthly_keep: Number(settings.monthly_keep),
        is_enabled: settings.is_enabled,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      });

    setSaving(false);

    if (error) {
      toast({
        title: "Could not save retention settings",
        description: error.message.includes("policy") || error.code === "42501"
          ? "You don't have permission to change these settings."
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Retention settings saved",
        description: "Retention policy parameters updated successfully.",
      });
      setSettings((prev) => ({ ...prev, updated_by: updatedBy, updated_at: new Date().toISOString() }));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Retention Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading retention settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Retention Policy Settings</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="retention-active" className="text-sm font-normal text-muted-foreground">
              {settings.is_enabled ? "Active" : "Inactive"}
            </Label>
            <Switch
              id="retention-active"
              checked={settings.is_enabled}
              onCheckedChange={(checked) => setSettings((s) => ({ ...s, is_enabled: checked }))}
            />
          </div>
        </CardTitle>
        <CardDescription>
          Configure GFS (Grandfather-Father-Son) retention keep limits for automated backup pruning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="daily_keep">Daily Keep (min 1)</Label>
            <Input
              id="daily_keep"
              type="number"
              min={1}
              value={settings.daily_keep}
              onChange={(e) =>
                setSettings((s) => ({ ...s, daily_keep: Math.max(1, parseInt(e.target.value) || 1) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly_keep">Weekly Keep (min 1)</Label>
            <Input
              id="weekly_keep"
              type="number"
              min={1}
              value={settings.weekly_keep}
              onChange={(e) =>
                setSettings((s) => ({ ...s, weekly_keep: Math.max(1, parseInt(e.target.value) || 1) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly_keep">Monthly Keep (min 1)</Label>
            <Input
              id="monthly_keep"
              type="number"
              min={1}
              value={settings.monthly_keep}
              onChange={(e) =>
                setSettings((s) => ({ ...s, monthly_keep: Math.max(1, parseInt(e.target.value) || 1) }))
              }
            />
          </div>
        </div>

        {settings.updated_by && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last updated by {settings.updated_by}{" "}
            {settings.updated_at && formatDistanceToNow(new Date(settings.updated_at), { addSuffix: true })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onDryRun} className="gap-2">
              <Eye className="h-4 w-4" />
              Preview Retention Pruning (Dry-Run)
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onRunRetention}
              disabled={runningRetention}
              className="gap-2"
            >
              {runningRetention ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Run Retention Now
            </Button>
          </div>

          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function JobRow({
  job,
  isNewestCompleted,
  onRefetch,
}: {
  job: BackupJobRow;
  isNewestCompleted: boolean;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const total = job.progress?.tables_total ?? job.tables_to_export?.length ?? 0;
  const done = job.progress?.tables_done ?? job.tables_completed?.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const [openFiles, setOpenFiles] = React.useState(false);
  const [pinning, setPinning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const prefix = job.storage_prefix || `backups/${job.id}/`;

  const isInactiveStatus = job.status === "pruned" || job.status === "manually_deleted";

  // Manual delete disabled if pinned, newest completed backup, or inactive status
  const isDeleteDisabled = job.is_pinned === true || isNewestCompleted || isInactiveStatus || deleting;

  const handleTogglePin = async () => {
    setPinning(true);
    try {
      const nextPinState = !job.is_pinned;
      const { data, error } = await supabase.functions.invoke("crm-backup-pin", {
        body: { backup_id: job.id, pin: nextPinState },
      });

      if (error || (data && data.error)) {
        const errMsg = error?.message || data?.error || "Failed to update pin state";
        toast({ title: "Could not pin backup", description: errMsg, variant: "destructive" });
      } else {
        toast({
          title: nextPinState ? "Backup pinned" : "Backup unpinned",
          description: nextPinState
            ? "Pinned backups are protected from retention pruning and deletion."
            : "Backup is no longer pinned.",
        });
        onRefetch();
      }
    } catch (err) {
      toast({
        title: "Pin action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPinning(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteDialogOpen(false);
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-backup-delete", {
        body: { backup_id: job.id },
      });

      if (error || (data && data.error)) {
        const errMsg = error?.message || data?.error || "Failed to delete backup";
        toast({ title: "Could not delete backup", description: errMsg, variant: "destructive" });
      } else {
        toast({ title: "Backup deleted", description: "Backup files and metadata removed successfully." });
        onRefetch();
      }
    } catch (err) {
      toast({
        title: "Delete action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {statusBadge(job.status)}
          {integrityBadge(job.integrity_status)}
          {job.backup_tier && (
            <Badge variant="outline" className="capitalize text-xs">
              {job.backup_tier}
            </Badge>
          )}
          {job.is_pinned && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-xs">
              <Pin className="h-3 w-3 fill-current" /> Pinned
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
          </span>
          <span className="text-sm">· by {job.requested_by}</span>
        </div>

        <div className="flex items-center gap-2">
          {job.total_size_bytes != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {formatBytes(job.total_size_bytes)}
            </span>
          )}

          <div className="text-xs text-muted-foreground">
            {done}/{total || "?"} tables
          </div>

          <div className="flex items-center gap-1 pl-2 border-l">
            <Button
              size="icon"
              variant="ghost"
              className={`h-8 w-8 ${job.is_pinned ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground"}`}
              title={isInactiveStatus ? "Cannot pin inactive backup" : job.is_pinned ? "Unpin backup" : "Pin backup"}
              disabled={isInactiveStatus || pinning}
              onClick={handleTogglePin}
            >
              {pinning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pin className={`h-4 w-4 ${job.is_pinned ? "fill-amber-500" : ""}`} />
              )}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
              title={
                isInactiveStatus
                  ? "Already deleted/pruned"
                  : job.is_pinned
                  ? "Cannot delete pinned backup"
                  : isNewestCompleted
                  ? "Cannot delete newest completed backup"
                  : "Delete backup"
              }
              disabled={isDeleteDisabled}
              onClick={() => setDeleteDialogOpen(true)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {job.is_pinned && job.pinned_by && (
        <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <Pin className="h-3 w-3 fill-current" />
          Pinned by {job.pinned_by}{" "}
          {job.pinned_at && formatDistanceToNow(new Date(job.pinned_at), { addSuffix: true })}
        </div>
      )}

      {(job.status === "pending" || job.status === "processing") && (
        <div className="space-y-1">
          <Progress value={total > 0 ? pct : (undefined as any)} />
          {job.progress?.current_table && (
            <div className="text-xs text-muted-foreground">
              Exporting <span className="font-mono">{job.progress.current_table}</span>
            </div>
          )}
        </div>
      )}

      {job.status === "failed" && job.error_message && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Backup failed</AlertTitle>
          <AlertDescription className="break-all">{job.error_message}</AlertDescription>
        </Alert>
      )}

      {job.status === "completed" && (
        <div className="space-y-2">
          {job.zip_path ? (
            <Button onClick={() => openSignedUrl(job.zip_path!)} className="gap-2">
              <Package className="h-4 w-4" />
              Download Full Backup (.zip)
            </Button>
          ) : (
            <div className="text-xs text-muted-foreground">Zip not available — use per-table files below.</div>
          )}

          <Collapsible open={openFiles} onOpenChange={setOpenFiles}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 h-7 px-2">
                <ChevronDown className={`h-3 w-3 transition-transform ${openFiles ? "rotate-180" : ""}`} />
                Individual table files
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-2 max-h-64 overflow-y-auto text-sm">
                {(job.tables_to_export || job.tables_completed || []).map((t) => (
                  <div key={t} className="flex items-center justify-between gap-2 px-2 py-1 border rounded">
                    <span className="font-mono text-xs truncate">{t}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => openSignedUrl(`${prefix}tables/${t}.json`)}
                      >
                        JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => openSignedUrl(`${prefix}tables/${t}.csv`)}
                      >
                        CSV
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Confirm Backup Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Are you sure you want to permanently delete this backup? All storage files and associated zip files
                will be removed.
              </span>
              <span className="block font-mono text-xs bg-muted p-2 rounded">
                ID: {job.id} <br />
                Created: {new Date(job.created_at).toLocaleString()}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              Delete Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function BackupRestorePanel() {
  const { toast } = useToast();
  const { restoring, restoreBackup } = useCrmBackups();
  const { jobs, loading: jobsLoading, createBackupJob, refetch: refetchJobs } = useBackupJobs();

  const [includeModules, setIncludeModules] = useState<BackupModuleKey[]>(ALL_MODULE_KEYS);
  const [includeFiles, setIncludeFiles] = useState(true);

  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);

  const [dryRunModalOpen, setDryRunModalOpen] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunData, setDryRunData] = useState<{
    candidates_count?: number;
    candidates?: DryRunCandidate[];
    message?: string;
  } | null>(null);

  const [retentionConfirmOpen, setRetentionConfirmOpen] = useState(false);
  const [retentionFetchingCount, setRetentionFetchingCount] = useState(false);
  const [retentionExecuting, setRetentionExecuting] = useState(false);
  const [retentionCandidateCount, setRetentionCandidateCount] = useState<number | null>(null);

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed" && j.manifest_path),
    [jobs],
  );

  const newestCompletedJobId = useMemo(() => {
    const completed = jobs
      .filter((j) => j.status === "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return completed.length > 0 ? completed[0].id : null;
  }, [jobs]);

  const handleRunDryRun = async () => {
    setDryRunModalOpen(true);
    setDryRunLoading(true);
    setDryRunData(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-backup-retention", {
        body: { dry_run: true },
      });

      if (error) {
        toast({
          title: "Dry-run failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setDryRunData(data);
      }
    } catch (err) {
      toast({
        title: "Dry-run failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleOpenRetentionConfirm = async () => {
    setRetentionFetchingCount(true);
    setRetentionCandidateCount(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-backup-retention", {
        body: { dry_run: true },
      });

      if (error || (data && data.error)) {
        const errMsg = error?.message || data?.error || "Failed to evaluate retention candidates";
        toast({ title: "Could not evaluate retention", description: errMsg, variant: "destructive" });
        return;
      }

      setRetentionCandidateCount(data?.candidates_count ?? 0);
      setRetentionConfirmOpen(true);
    } catch (err) {
      toast({
        title: "Could not evaluate retention",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRetentionFetchingCount(false);
    }
  };

  const handleExecuteRetention = async () => {
    setRetentionConfirmOpen(false);
    setRetentionExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-backup-retention", {
        body: { dry_run: false },
      });

      if (error || (data && data.error)) {
        const errMsg = error?.message || data?.error || "Failed to execute retention pruning";
        toast({ title: "Retention pruning failed", description: errMsg, variant: "destructive" });
      } else {
        const prunedCount = data?.pruned_count ?? 0;
        toast({
          title: "Retention pruning completed",
          description: `Successfully pruned ${prunedCount} ${prunedCount === 1 ? "backup" : "backups"}.`,
        });
        refetchJobs();
      }
    } catch (err) {
      toast({
        title: "Retention pruning failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRetentionExecuting(false);
    }
  };

  const toggleModule = (
    key: BackupModuleKey,
    checked: boolean,
    setter: (next: BackupModuleKey[]) => void,
    current: BackupModuleKey[],
  ) => {
    setter(checked ? [...new Set([...current, key])] : current.filter((k) => k !== key));
  };

  const runCreate = async () => {
    try {
      await createBackupJob({ includeModules, includeFiles });
      toast({
        title: "Backup initiated",
        description: "This usually takes 1–3 minutes. Track progress below.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start backup";
      toast({ title: "Could not start backup", description: msg, variant: "destructive" });
    }
  };

  const runRestore = async () => {
    setConfirmOpen(false);
    try {
      let result;
      if (uploadedFile) {
        result = await restoreBackup(uploadedFile, setRestoreProgress);
      } else if (restoreJobId) {
        const job = completedJobs.find((j) => j.id === restoreJobId);
        if (!job?.manifest_path) throw new Error("Selected job has no manifest");
        result = await restoreBackup({ manifestPath: job.manifest_path }, setRestoreProgress);
      } else {
        toast({ title: "Select a backup", description: "Pick a completed backup or upload a .zip.", variant: "destructive" });
        return;
      }
      toast({
        title: "Restore complete",
        description: `Restored ${result?.tablesRestored ?? 0} tables.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Restore failed";
      toast({ title: "Restore failed", description: msg, variant: "destructive" });
    } finally {
      setRestoreProgress(null);
    }
  };

  return (
    <Tabs defaultValue="create" className="w-full">
      <TabsList>
        <TabsTrigger value="create">Create Backup</TabsTrigger>
        <TabsTrigger value="restore">Restore</TabsTrigger>
      </TabsList>

      <TabsContent value="create" className="mt-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Create Backup</CardTitle>
            <CardDescription>
              Backups run in the background. You can close this page — you'll be notified when it completes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Button variant="outline" onClick={() => setIncludeModules(ALL_MODULE_KEYS)}>
                Complete Backup (recommended)
              </Button>
              <div className="flex items-center gap-2">
                <Checkbox checked={includeFiles} onCheckedChange={(v) => setIncludeFiles(Boolean(v))} id="includeFiles" />
                <Label htmlFor="includeFiles">Include attachment files</Label>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={includeModules.includes(m.key)}
                    onCheckedChange={(v) =>
                      toggleModule(m.key, Boolean(v), (next) => setIncludeModules(next), includeModules)
                    }
                  />
                  <div className="space-y-0.5">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-sm text-muted-foreground">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <Button onClick={runCreate} disabled={includeModules.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Start Backup
              </Button>
            </div>
          </CardContent>
        </Card>

        <RetentionSettingsSection
          onDryRun={handleRunDryRun}
          onRunRetention={handleOpenRetentionConfirm}
          runningRetention={retentionFetchingCount || retentionExecuting}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent Backups</CardTitle>
            <CardDescription>Your last 20 backup jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobsLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No backups yet.</div>
            ) : (
              jobs.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  isNewestCompleted={j.id === newestCompletedJobId}
                  onRefetch={refetchJobs}
                />
              ))
            )}
          </CardContent>
        </Card>

        <AlertDialog open={retentionConfirmOpen} onOpenChange={setRetentionConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                Confirm Bulk Retention Pruning
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span>
                  This will prune <strong>{retentionCandidateCount ?? 0}</strong>{" "}
                  {retentionCandidateCount === 1 ? "backup" : "backups"} under current GFS retention policies.
                  Storage files and zip archives for pruned backups will be permanently deleted.
                </span>
                <span className="block text-xs text-muted-foreground">
                  Pinned backups and the single newest completed backup are protected and will not be pruned.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  void handleExecuteRetention();
                }}
              >
                Prune {retentionCandidateCount ?? 0} {retentionCandidateCount === 1 ? "Backup" : "Backups"} Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={dryRunModalOpen} onOpenChange={setDryRunModalOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Retention Pruning Preview (Dry-Run)
              </DialogTitle>
              <DialogDescription>
                Simulated retention evaluation under saved retention settings. No backups will be deleted.
              </DialogDescription>
            </DialogHeader>

            {dryRunLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Running retention dry-run simulation…
              </div>
            ) : dryRunData ? (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-sm font-medium">Eligible Candidates for Pruning</span>
                  <Badge variant={dryRunData.candidates_count ? "destructive" : "secondary"}>
                    {dryRunData.candidates_count ?? 0} candidates
                  </Badge>
                </div>

                {!dryRunData.candidates || dryRunData.candidates.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground bg-muted/40 rounded-md border border-dashed">
                    No backups eligible for pruning under current retention settings.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {dryRunData.candidates.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-md text-sm bg-background"
                      >
                        <div className="space-y-0.5">
                          <div className="font-mono text-xs text-muted-foreground truncate max-w-[280px]">
                            {c.id}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Created: {new Date(c.created_at).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="capitalize text-xs">
                            {c.tier}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">
                            {formatBytes(c.total_size_bytes)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                No preview data available.
              </div>
            )}
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="restore" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Restore Backup</CardTitle>
            <CardDescription>
              Restore upserts rows by primary key — existing rows with matching IDs will be overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Restore from a previous backup</Label>
              <Select
                value={restoreJobId || ""}
                onValueChange={(v) => {
                  setRestoreJobId(v || null);
                  setUploadedFile(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={jobsLoading ? "Loading…" : "Select a completed backup"} />
                </SelectTrigger>
                <SelectContent>
                  {completedJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {new Date(j.created_at).toLocaleString()} · {j.tables_to_export?.length ?? "?"} tables
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="text-xs text-muted-foreground pt-2">Or upload a downloaded backup.zip:</div>
              <Input
                type="file"
                accept="application/zip,.zip"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadedFile(f);
                  if (f) setRestoreJobId(null);
                }}
              />
            </div>

            {restoreProgress && (
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {restoreProgress.phase === "reading" ? "Reading backup…" : "Restoring…"}
                </AlertTitle>
                <AlertDescription>
                  {restoreProgress.currentTable && (
                    <>
                      Restoring <span className="font-mono">{restoreProgress.currentTable}</span>
                      {restoreProgress.tableIndex && restoreProgress.tableTotal && (
                        <> ({restoreProgress.tableIndex}/{restoreProgress.tableTotal})</>
                      )}
                      {restoreProgress.batchIndex && restoreProgress.batchTotal && (
                        <> — batch {restoreProgress.batchIndex}/{restoreProgress.batchTotal}</>
                      )}
                    </>
                  )}
                  {restoreProgress.tableIndex && restoreProgress.tableTotal && (
                    <Progress
                      className="mt-2"
                      value={Math.round((restoreProgress.tableIndex / restoreProgress.tableTotal) * 100)}
                    />
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={restoring || (!uploadedFile && !restoreJobId)}
              >
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Restore
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Confirm restore
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will upsert rows into the selected tables. Existing rows with matching primary keys will be overwritten. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); void runRestore(); }}>
                Confirm & Restore
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>
    </Tabs>
  );
}
