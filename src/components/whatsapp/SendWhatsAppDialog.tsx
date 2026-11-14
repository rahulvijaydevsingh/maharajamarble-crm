import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, Loader2, AlertTriangle, Eye } from "lucide-react";
import { useWhatsAppMessages, WhatsAppSendInput } from "@/hooks/useWhatsAppMessages";

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
}

const placeholders = ["{{name}}", "{{firm_name}}", "{{site_location}}", "{{site_map_link}}", "{{assigned_to}}", "{{showroom_name}}", "{{showroom_map_link}}"];

export function SendWhatsAppDialog({
  open, onOpenChange, recipientName, recipientPhone, leadId, customerId, professionalId,
  defaultMessage = "", sitePlusCode, siteLocation = "", firmName = "", assignedTo = "",
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
  const { previewSend, commitSend } = useWhatsAppMessages(leadId, customerId);

  const input = useMemo<WhatsAppSendInput>(() => ({
    recipientPhone, recipientName, messageBody: message, slot,
    leadId, customerId, professionalId,
    ...(locationMode !== "none" ? {
      location: locationMode === "custom"
        ? { mode: "custom", lat: customLat, lng: customLng, name: customName }
        : { mode: locationMode },
    } : {}),
  }), [recipientPhone, recipientName, message, slot, leadId, customerId, professionalId, locationMode, customLat, customLng, customName]);

  const insertPlaceholder = (value: string) => {
    setMessage((current) => current ? current + " " + value : value);
    setPreview(null);
    setPreviewToken("");
  };

  const handlePreview = async () => {
    setWorking(true);
    setError(null);
    setPreview(null);
    setPreviewToken("");
    const result = await previewSend(input);
    if (!result.success) {
      setError(result.error ?? "Preview failed.");
    } else {
      setRequestId(result.requestId);
      setPreview(result.data);
      setPreviewToken(result.data?.preview_token ?? "");
    }
    setWorking(false);
  };

  const handleCommit = async () => {
    if (!requestId || !previewToken) return;
    setWorking(true);
    setError(null);
    const result = await commitSend(input, requestId, previewToken);
    setWorking(false);
    if (!result.success) {
      setError(result.error ?? "Could not queue this message.");
    } else {
      setMessage("");
      setPreview(null);
      setPreviewToken("");
      onOpenChange(false);
    }
  };

  const previewRecipient = preview?.recipients?.[0];
  const isBlocked = previewRecipient?.status === "blocked";
  const canPreview = Boolean(message.trim() || locationMode !== "none");

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) { setPreview(null); setPreviewToken(""); setError(null); } }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" /> Send WhatsApp</DialogTitle>
          <DialogDescription>Preview the server-rendered message before it enters the sending queue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            <div><Label className="text-xs text-muted-foreground">Recipient</Label><p className="font-medium">{recipientName}</p><p className="text-sm text-muted-foreground">{recipientPhone}</p></div>
            <div><Label className="text-xs text-muted-foreground">Sending from</Label>
              <Select value={slot} onValueChange={(value) => { setSlot(value as "main" | "personal"); setPreview(null); setPreviewToken(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="main">Official Main WhatsApp</SelectItem><SelectItem value="personal">My Personal WhatsApp</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={message} onChange={(event) => { setMessage(event.target.value.slice(0, 4000)); setPreview(null); setPreviewToken(""); }} rows={5} placeholder="Write your WhatsApp message…" />
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((value) => <Button key={value} type="button" size="sm" variant="outline" onClick={() => insertPlaceholder(value)}>{value}</Button>)}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Location pin (optional)</Label>
            <Select value={locationMode} onValueChange={(value) => { setLocationMode(value); setPreview(null); setPreviewToken(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                <SelectItem value="showroom">Showroom pin</SelectItem>
                <SelectItem value="site">Site Plus Code pin</SelectItem>
                <SelectItem value="custom">Custom coordinates</SelectItem>
              </SelectContent>
            </Select>
            {locationMode === "site" && <p className="text-xs text-muted-foreground">Site Plus Code: {sitePlusCode || "Not provided"} {siteLocation ? "— " + siteLocation : ""}</p>}
            {locationMode === "custom" && <div className="grid grid-cols-2 gap-2">
              <div><Label>Latitude</Label><input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={customLat} onChange={(e) => setCustomLat(e.target.value)} /></div>
              <div><Label>Longitude</Label><input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={customLng} onChange={(e) => setCustomLng(e.target.value)} /></div>
              <div className="col-span-2"><Label>Location name</Label><input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={customName} onChange={(e) => setCustomName(e.target.value)} /></div>
            </div>}
          </div>
          {preview && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between"><Label>Server preview</Label><Badge variant={isBlocked ? "destructive" : "secondary"}>{previewRecipient?.status ?? "checked"}</Badge></div>
              <p className="text-xs text-muted-foreground">Recipient: {previewRecipient?.masked_phone ?? "—"}</p>
              <p className="whitespace-pre-wrap text-sm">{previewRecipient?.rendered_text || (previewRecipient?.location ? "Location pin message" : "")}</p>
              {previewRecipient?.blocked_reasons?.length > 0 && <p className="text-sm text-destructive">Blocked: {previewRecipient.blocked_reasons.join(", ")}</p>}
              <p className="text-xs text-muted-foreground">Estimated send duration: {preview.summary?.estimated_duration_seconds ?? 0}s</p>
            </div>
          )}
          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!previewToken || isBlocked ? (
            <Button onClick={handlePreview} disabled={working || !canPreview}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />} Preview Message
            </Button>
          ) : (
            <Button onClick={handleCommit} disabled={working}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Confirm & Send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
