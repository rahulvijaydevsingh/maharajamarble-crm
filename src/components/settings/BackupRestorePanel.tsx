import React, { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
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
  }
}

async function openSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from("crm-backups").createSignedUrl(path, 3600);
  if (error || !data) return;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function JobRow({ job }: { job: BackupJobRow }) {
  const total = job.progress?.tables_total ?? job.tables_to_export?.length ?? 0;
  const done = job.progress?.tables_done ?? job.tables_completed?.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const [openFiles, setOpenFiles] = React.useState(false);
  const prefix = job.storage_prefix || `backups/${job.id}/`;

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {statusBadge(job.status)}
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
          </span>
          <span className="text-sm">· by {job.requested_by}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {done}/{total || "?"} tables
        </div>
      </div>

      {(job.status === "pending" || job.status === "processing") && (
        <div className="space-y-1">
          <Progress value={total > 0 ? pct : undefined as any} />
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
            <div className="text-xs text-muted-foreground">
              Zip not available — use per-table files below.
            </div>
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
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => openSignedUrl(`${prefix}tables/${t}.json`)}>JSON</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => openSignedUrl(`${prefix}tables/${t}.csv`)}>CSV</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

export function BackupRestorePanel() {
  const { toast } = useToast();
  const { restoring, restoreBackup } = useCrmBackups();
  const { jobs, loading: jobsLoading, createBackupJob } = useBackupJobs();

  const [includeModules, setIncludeModules] = useState<BackupModuleKey[]>(ALL_MODULE_KEYS);
  const [includeFiles, setIncludeFiles] = useState(true);

  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed" && j.manifest_path),
    [jobs],
  );

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
              jobs.map((j) => <JobRow key={j.id} job={j} />)
            )}
          </CardContent>
        </Card>
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
