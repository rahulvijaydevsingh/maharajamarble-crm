import React, { useMemo, useState } from "react";
import { Archive, FileImage, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppLibrary } from "@/hooks/useWhatsAppLibrary";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";
import { useAuth } from "@/contexts/AuthContext";
import type { WhatsAppLibraryCategory, WhatsAppLibraryItemRow } from "@/lib/whatsappMedia";

const categoryLabels: Record<WhatsAppLibraryCategory, string> = {
  catalogue: "Catalogue",
  material_image: "Material image",
  price_list: "Price list / document",
  other: "Other",
};

function displayCategory(kind: WhatsAppLibraryItemRow["kind"]): string {
  if (kind === "catalogue") return "Catalogue";
  if (kind === "image") return "Material image";
  return "Price list / document";
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes < 1) return "Size unavailable";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function WhatsAppLibraryManager() {
  const { toast } = useToast();
  const auth = useAuth();
  const isAdmin = Boolean(auth.isAdmin());
  const { settings } = useWhatsAppSettings();
  const isModuleEnabled = Boolean(settings?.module_enabled);
  const { items, loading, mutating, libraryUnavailable, upload, setActive, remove } = useWhatsAppLibrary({
    enabled: isAdmin && isModuleEnabled,
  });
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WhatsAppLibraryCategory>("catalogue");

  const usedBytes = useMemo(
    () => items.filter((item) => item.active).reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0),
    [items],
  );

  const submit = async () => {
    if (!file) {
      toast({ title: "Choose a file", description: "Select a PDF or image to upload.", variant: "destructive" });
      return;
    }
    try {
      await upload({ file, title: title.trim() || file.name, description, category });
      setFile(null);
      setTitle("");
      setDescription("");
      const picker = document.getElementById("wa-library-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
    } catch {
      // The hook reports the error through a toast.
    }
  };

  const handleDelete = async (item: WhatsAppLibraryItemRow) => {
    if (!window.confirm("Delete " + item.title + " from the reusable WhatsApp library?")) return;
    try {
      await remove(item);
    } catch {
      // The hook reports the error through a toast.
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reusable WhatsApp Media Library</CardTitle>
          <CardDescription>Active catalogues and material images available to staff.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Library management is available to administrators only.
        </CardContent>
      </Card>
    );
  }

  if (!isModuleEnabled || libraryUnavailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Reusable WhatsApp Media Library
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Enable the WhatsApp module after backend setup to manage the reusable media library.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Reusable WhatsApp Media Library
        </CardTitle>
        <CardDescription>
          Upload catalogues, price lists, and slab images once, then reuse them in 1:1 WhatsApp messages.
          PDF limit: 16 MB. Image limit: 5 MB. Active library quota: 350 MB.
        </CardDescription>
        <div className="text-xs text-muted-foreground">
          Active media currently listed: {formatBytes(usedBytes)}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="wa-library-file">File (PDF, JPEG, PNG, WebP)</Label>
            <Input
              id="wa-library-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-library-title">Display title</Label>
            <Input
              id="wa-library-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Signature Quartz Catalogue"
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as WhatsAppLibraryCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <SelectItem value={value} key={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="wa-library-description">Description (optional)</Label>
            <Textarea
              id="wa-library-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Short internal description for staff"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={() => void submit()} disabled={mutating || !file}>
              {mutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload to library
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Library items</h3>
            <Badge variant="outline">{items.length} item(s)</Badge>
          </div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
              No reusable media has been uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {item.kind === "image" ? (
                      <FileImage className="h-5 w-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {displayCategory(item.kind)} · {item.filename || "file"} · {formatBytes(item.size_bytes)}
                      </p>
                      {item.description && <p className="truncate text-xs text-muted-foreground">{item.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={item.active ? "secondary" : "outline"}>{item.active ? "Active" : "Archived"}</Badge>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs" htmlFor={"wa-library-active-" + item.id}>Active</Label>
                      <Switch
                        id={"wa-library-active-" + item.id}
                        checked={item.active}
                        disabled={mutating}
                        onCheckedChange={(checked) => void setActive(item.id, checked).catch(() => undefined)}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={"Delete " + item.title}
                      disabled={mutating}
                      onClick={() => void handleDelete(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
