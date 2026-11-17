import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, Loader2, AlertTriangle, Eye, Paperclip, X } from "lucide-react";
import { useWhatsAppMessages, WhatsAppSendInput } from "@/hooks/useWhatsAppMessages";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";
import { useWhatsAppLibrary } from "@/hooks/useWhatsAppLibrary";
import { useAuth } from "@/contexts/AuthContext";
import {
  mapLibraryRowToMediaRef,
  toEnqueueMediaAttachment,
  uploadWhatsAppStagingMedia,
  type WhatsAppLibraryItemRow,
  type WhatsAppMediaRef,
  type WhatsAppStagingMediaRef,
} from "@/lib/whatsappMedia";

interface SendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientPhone: string;
  leadId?: string;
  customerId?: string;
  professionalId?: string;
  defaultMessage?: string;
  sitePlusCode?: string;
  siteLocation?: string;
  firmName?: string;
  assignedTo?: string;
  defaultAttachment?: WhatsAppMediaRef | null;
  quotationNumber?: string;
  quotationTotal?: string;
  validUntil?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

const placeholders = [
  "{{name}}",
  "{{firm_name}}",
  "{{site_location}}",
  "{{site_map_link}}",
  "{{assigned_to}}",
  "{{showroom_name}}",
  "{{showroom_map_link}}",
];

function usableLibraryItem(item: WhatsAppLibraryItemRow): boolean {
  return Boolean(item.active && item.path && item.filename && item.mime);
}

export function SendWhatsAppDialog({
  open,
  onOpenChange,
  recipientName,
  recipientPhone,
  leadId,
  customerId,
  professionalId,
  defaultMessage = "",
  sitePlusCode,
  siteLocation = "",
  defaultAttachment = null,
  quotationNumber,
  quotationTotal,
  validUntil,
  relatedEntityType,
  relatedEntityId,
}: SendWhatsAppDialogProps) {
  const [slot, setSlot] = useState<"main" | "personal">("main");
  const [message, setMessage] = useState(defaultMessage);
  const [locationMode, setLocationMode] = useState("none");
  const [customLat, setCustomLat] = useState("");
  const [customLng, setCustomLng] = useState("");
  const [customName, setCustomName] = useState("Pinned Location");
  const [preview, setPreview] = useState<any>(null);
  const [requestId, setRequestId] = useState("");
  const [previewToken, setPreviewToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [stagingAttachment, setStagingAttachment] = useState<WhatsAppStagingMediaRef | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const { previewSend, commitSend } = useWhatsAppMessages(leadId, customerId);
  const { slotStatus } = useWhatsAppSettings();
  const { items: libraryItems, refresh: refreshLibrary } = useWhatsAppLibrary();
  const auth = useAuth();

  const canUsePersonal = Boolean(slotStatus?.slots?.personal?.can_send);
  const availableLibraryItems = useMemo(
    () => libraryItems.filter(usableLibraryItem),
    [libraryItems],
  );
  const selectedLibraryItem = availableLibraryItems.find((item) => item.id === selectedLibraryId) ?? null;
  const mediaToSend = useMemo<WhatsAppMediaRef | null>(() => {
    if (stagingAttachment) return stagingAttachment;
    if (selectedLibraryItem) return mapLibraryRowToMediaRef(selectedLibraryItem);
    if (defaultAttachment?.kind === "library") {
      return availableLibraryItems.find((item) => item.id === defaultAttachment.library_item_id)
        ? defaultAttachment
        : null;
    }
    return null;
  }, [stagingAttachment, selectedLibraryItem, defaultAttachment, availableLibraryItems]);

  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage);
    setPreview(null);
    setRequestId("");
    setPreviewToken("");
    setError(null);
    setStagingAttachment(defaultAttachment?.kind === "staging" ? defaultAttachment : null);
    setSelectedLibraryId(defaultAttachment?.kind === "library" ? defaultAttachment.library_item_id : "");
    setLocationMode("none");
    void refreshLibrary();
  }, [open, defaultMessage, defaultAttachment, refreshLibrary]);

  const resetPreview = () => {
    setPreview(null);
    setRequestId("");
    setPreviewToken("");
  };

  const locationInput = useMemo<Record<string, unknown> | undefined>(() => {
    if (locationMode === "none") return undefined;
    if (locationMode === "custom") {
      return {
        mode: "custom",
        lat: customLat,
        lng: customLng,
        name: customName,
      };
    }
    return { mode: locationMode };
  }, [locationMode, customLat, customLng, customName]);

  const input = useMemo<WhatsAppSendInput>(() => ({
    recipientPhone,
    recipientName,
    messageBody: message,
    slot,
    leadId,
    customerId,
    professionalId,
    ...(mediaToSend ? { attachment: toEnqueueMediaAttachment(mediaToSend) } : {}),
    ...(locationInput ? { location: locationInput } : {}),
    ...(quotationNumber ? { quotationNumber } : {}),
    ...(quotationTotal ? { quotationTotal } : {}),
    ...(validUntil ? { validUntil } : {}),
    ...(relatedEntityType ? { relatedEntityType } : {}),
    ...(relatedEntityId ? { relatedEntityId } : {}),
  }), [
    recipientPhone,
    recipientName,
    message,
    slot,
    leadId,
    customerId,
    professionalId,
    mediaToSend,
    locationInput,
    quotationNumber,
    quotationTotal,
    validUntil,
    relatedEntityType,
    relatedEntityId,
  ]);

  const insertPlaceholder = (value: string) => {
    setMessage((current) => (current ? current + " " + value : value));
    resetPreview();
  };

  const handleMediaFile = async (file: File | undefined) => {
    if (!file) return;
    if (!auth.user?.id) {
      setError("Sign in again before uploading an attachment.");
      return;
    }
    setMediaUploading(true);
    setError(null);
    try {
      const uploaded = await uploadWhatsAppStagingMedia({
        blob: file,
        fileName: file.name,
        userId: auth.user.id,
      });
      setStagingAttachment(uploaded);
      setSelectedLibraryId("");
      setLocationMode("none");
      resetPreview();
    } catch (uploadError: any) {
      setError(uploadError?.message ?? "Could not upload this attachment.");
    } finally {
      setMediaUploading(false);
    }
  };

  const clearMedia = () => {
    setStagingAttachment(null);
    setSelectedLibraryId("");
    resetPreview();
  };

  const handlePreview = async () => {
    setWorking(true);
    setError(null);
    resetPreview();
    try {
      const result = await previewSend(input);
      if (!result.success) {
        setError(result.error ?? "Preview failed.");
      } else {
        setRequestId(result.requestId);
        setPreview(result.data);
        setPreviewToken(result.data?.preview_token ?? "");
      }
    } finally {
      setWorking(false);
    }
  };

  const handleCommit = async () => {
    if (!requestId || !previewToken) return;
    setWorking(true);
    setError(null);
    try {
      const result = await commitSend(input, requestId, previewToken);
      if (!result.success) {
        setError(result.error ?? "Could not queue this message.");
      } else {
        setMessage("");
        resetPreview();
        onOpenChange(false);
      }
    } finally {
      setWorking(false);
    }
  };

  const previewRecipient = preview?.recipients?.[0];
  const isBlocked = previewRecipient?.status === "blocked";
  const canPreview = Boolean(message.trim() || locationMode !== "none" || mediaToSend);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          resetPreview();
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Send WhatsApp
          </DialogTitle>
          <DialogDescription>
            Preview the server-rendered message and attachment or location before it enters the sending queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            <div>
              <Label className="text-xs text-muted-foreground">Recipient</Label>
              <p className="font-medium">{recipientName}</p>
              <p className="text-sm text-muted-foreground">{recipientPhone}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Sending from</Label>
              <Select
                value={slot}
                onValueChange={(value) => {
                  setSlot(value as "main" | "personal");
                  resetPreview();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Official Main WhatsApp</SelectItem>
                  {canUsePersonal && <SelectItem value="personal">My Personal WhatsApp</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Message / caption</Label>
            <Textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value.slice(0, 4000));
                resetPreview();
              }}
              rows={4}
              placeholder="Write your WhatsApp message…"
            />
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((value) => (
                <Button key={value} type="button" size="sm" variant="outline" onClick={() => insertPlaceholder(value)}>
                  {value}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachment (optional)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              disabled={mediaUploading}
              onChange={(event) => {
                void handleMediaFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">PDF up to 16 MB; JPEG, PNG or WebP up to 5 MB.</p>
            <div className="space-y-1">
              <Label className="text-xs">Or choose from the reusable library</Label>
              <Select
                value={selectedLibraryId || "none"}
                onValueChange={(value) => {
                  setSelectedLibraryId(value === "none" ? "" : value);
                  if (value !== "none") {
                    setStagingAttachment(null);
                    setLocationMode("none");
                  }
                  resetPreview();
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a library item" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No library item</SelectItem>
                  {availableLibraryItems.map((item) => (
                    <SelectItem value={item.id} key={item.id}>
                      {item.title} · {item.filename ?? item.kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mediaToSend && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {mediaToSend.kind === "staging" ? mediaToSend.file_name : (mediaToSend.title || mediaToSend.file_name)}
                  {" · "}{(mediaToSend.byte_size / (1024 * 1024)).toFixed(2)} MB
                </span>
                <Button type="button" size="icon" variant="ghost" aria-label="Remove attachment" onClick={clearMedia}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {mediaUploading && <p className="text-xs text-muted-foreground">Uploading attachment securely…</p>}
          </div>

          <div className="space-y-2">
            <Label>Location pin (optional)</Label>
            <Select
              value={locationMode}
              onValueChange={(value) => {
                setLocationMode(value);
                if (value !== "none") clearMedia();
                resetPreview();
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                <SelectItem value="showroom">Showroom pin</SelectItem>
                <SelectItem value="site">Site Plus Code pin</SelectItem>
                <SelectItem value="custom">Custom coordinates</SelectItem>
              </SelectContent>
            </Select>
            {locationMode === "site" && (
              <p className="text-xs text-muted-foreground">
                Site Plus Code: {sitePlusCode || "Not provided"}{siteLocation ? " — " + siteLocation : ""}
              </p>
            )}
            {locationMode === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Latitude</Label>
                  <Input value={customLat} onChange={(event) => { setCustomLat(event.target.value); resetPreview(); }} />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input value={customLng} onChange={(event) => { setCustomLng(event.target.value); resetPreview(); }} />
                </div>
                <div className="col-span-2">
                  <Label>Location name</Label>
                  <Input value={customName} onChange={(event) => { setCustomName(event.target.value); resetPreview(); }} />
                </div>
              </div>
            )}
          </div>

          {preview && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>Server preview</Label>
                <Badge variant={isBlocked ? "destructive" : "secondary"}>{previewRecipient?.status ?? "checked"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Recipient: {previewRecipient?.masked_phone ?? "—"}</p>
              <p className="whitespace-pre-wrap text-sm">
                {previewRecipient?.rendered_text ||
                  (previewRecipient?.location ? "Location pin message" :
                    previewRecipient?.message_type === "media" ? "Media attachment message" : "")}
              </p>
              {previewRecipient?.blocked_reasons?.length > 0 && (
                <p className="text-sm text-destructive">Blocked: {previewRecipient.blocked_reasons.join(", ")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Estimated send duration: {preview.summary?.estimated_duration_seconds ?? 0}s
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!previewToken || isBlocked ? (
            <Button onClick={() => void handlePreview()} disabled={working || mediaUploading || !canPreview}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Preview Message
            </Button>
          ) : (
            <Button onClick={() => void handleCommit()} disabled={working || mediaUploading}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Confirm & Send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
