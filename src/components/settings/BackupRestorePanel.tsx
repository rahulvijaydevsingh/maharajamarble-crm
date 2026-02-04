import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCrmBackups, type BackupModuleKey } from "@/hooks/useCrmBackups";
import { Download, FileUp, History, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

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
];

const ALL_MODULE_KEYS = MODULES.map((m) => m.key);

export function BackupRestorePanel() {
  const { toast } = useToast();
  const { backups, loading, creating, restoring, refresh, createBackup, uploadBackupJson, restoreBackup } = useCrmBackups();

  const [includeModules, setIncludeModules] = useState<BackupModuleKey[]>(ALL_MODULE_KEYS);
  const [includeFiles, setIncludeFiles] = useState(true);

  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoreModules, setRestoreModules] = useState<BackupModuleKey[]>(ALL_MODULE_KEYS);
  const [restoreFiles, setRestoreFiles] = useState(true);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [replaceConfirmText, setReplaceConfirmText] = useState("");

  const selectedBackup = useMemo(() => backups.find((b) => b.id === selectedBackupId) || null, [backups, selectedBackupId]);

  const toggleModule = (key: BackupModuleKey, checked: boolean, setter: (next: BackupModuleKey[]) => void, current: BackupModuleKey[]) => {
    setter(checked ? [...new Set([...current, key])] : current.filter((k) => k !== key));
  };

  const runCreate = async () => {
    try {
      const res = await createBackup({ includeModules, includeFiles });
      toast({ title: "Backup created", description: "Your JSON + Excel backup is ready." });
      // Open downloads if signed URLs are returned
      if (res?.json?.url) window.open(res.json.url, "_blank", "noopener,noreferrer");
      if (res?.xlsx?.url) window.open(res.xlsx.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create backup";
      toast({ title: "Backup failed", description: msg, variant: "destructive" });
    }
  };

  const runRestore = async () => {
    try {
      let sourceFilePath: string | undefined;
      let sourceBackupId: string | undefined;

      if (uploadedFile) {
        sourceFilePath = await uploadBackupJson(uploadedFile);
      } else if (selectedBackupId) {
        sourceBackupId = selectedBackupId;
      } else {
        toast({ title: "Select a backup", description: "Choose a previous backup or upload a JSON file.", variant: "destructive" });
        return;
      }

      const res = await restoreBackup({
        mode: restoreMode,
        includeModules: restoreModules,
        sourceBackupId,
        sourceFilePath,
        restoreFiles,
      });

      toast({ title: "Restore completed", description: "Restore finished successfully." });
      setReplaceConfirmOpen(false);
      setReplaceConfirmText("");
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to restore";
      toast({ title: "Restore failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <Tabs defaultValue="create" className="w-full">
      <TabsList>
        <TabsTrigger value="create">Create Backup</TabsTrigger>
        <TabsTrigger value="restore">Restore</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="create" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Create Backup</CardTitle>
            <CardDescription>Generate a JSON + Excel backup. Only admins can create and restore backups.</CardDescription>
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
                    onCheckedChange={(v) => toggleModule(m.key, Boolean(v), (next) => setIncludeModules(next), includeModules)}
                  />
                  <div className="space-y-0.5">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-sm text-muted-foreground">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <Button onClick={runCreate} disabled={creating || includeModules.length === 0}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Create & Download
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="restore" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Restore Backup</CardTitle>
            <CardDescription>Choose Merge (safe) or Replace (destructive). Replace will delete selected modules first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Restore mode</Label>
                <Select value={restoreMode} onValueChange={(v) => setRestoreMode(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">Merge (upsert)</SelectItem>
                    <SelectItem value="replace">Replace (delete then insert)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-8">
                <Checkbox checked={restoreFiles} onCheckedChange={(v) => setRestoreFiles(Boolean(v))} id="restoreFiles" />
                <Label htmlFor="restoreFiles">Restore attachment files</Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Select a previous backup</Label>
              <Select value={selectedBackupId || ""} onValueChange={(v) => { setSelectedBackupId(v || null); setUploadedFile(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading..." : "Select backup"} />
                </SelectTrigger>
                <SelectContent>
                  {(backups || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {new Date(b.created_at).toLocaleString()} — {b.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">Or upload a JSON backup file:</div>
              <Input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadedFile(f);
                  if (f) setSelectedBackupId(null);
                }}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={restoreModules.includes(m.key)}
                    onCheckedChange={(v) =>
                      toggleModule(m.key, Boolean(v), (next) => setRestoreModules(next), restoreModules)
                    }
                  />
                  <div className="space-y-0.5">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-sm text-muted-foreground">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant={restoreMode === "replace" ? "destructive" : "default"}
                onClick={() => {
                  if (restoreMode === "replace") {
                    setReplaceConfirmOpen(true);
                    return;
                  }
                  void runRestore();
                }}
                disabled={restoring || restoreModules.length === 0}
              >
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restoring...
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

        <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Replace restore (destructive)
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will delete data for the selected modules before restoring it. Type <b>RESTORE</b> to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="restoreConfirm">Confirmation</Label>
              <Input id="restoreConfirm" value={replaceConfirmText} onChange={(e) => setReplaceConfirmText(e.target.value)} placeholder="Type RESTORE" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (replaceConfirmText.trim() !== "RESTORE") return;
                  void runRestore();
                }}
                disabled={replaceConfirmText.trim() !== "RESTORE" || restoring}
              >
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  "Confirm & Restore"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Backup history
                </CardTitle>
                <CardDescription>Download the latest backup JSON/Excel files.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(backups || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No backups yet.</div>
            ) : (
              <div className="space-y-2">
                {backups.map((b) => (
                  <div key={b.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border rounded-md p-3">
                    <div>
                      <div className="font-medium">{new Date(b.created_at).toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">Status: {b.status}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!b.json_url}
                        onClick={() => b.json_url && window.open(b.json_url, "_blank", "noopener,noreferrer")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!b.xlsx_url}
                        onClick={() => b.xlsx_url && window.open(b.xlsx_url, "_blank", "noopener,noreferrer")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
