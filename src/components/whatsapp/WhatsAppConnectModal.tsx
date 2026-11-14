import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Smartphone } from "lucide-react";
import { useWhatsAppSession } from "@/hooks/useWhatsAppSession";

interface WhatsAppConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  slot?: "main" | "bulk" | "personal";
}

export function WhatsAppConnectModal({ open, onOpenChange, userId, slot = "personal" }: WhatsAppConnectModalProps) {
  const { sessionsBySlot, triggerSessionAction, refetch } = useWhatsAppSession(userId);
  const session = sessionsBySlot[slot];
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(20);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!session || ["disconnected", "logged_out", "error"].includes(session.status)) {
      setBusy(true);
      void triggerSessionAction("connect", slot).then((result) => {
        if (!result.success) setError(result.error ?? "Could not request a WhatsApp QR code.");
      }).finally(() => setBusy(false));
    }
  }, [open, slot]);

  useEffect(() => {
    if (!open || !session?.qr_payload) return;
    setCountdown(20);
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [open, session?.qr_payload]);

  useEffect(() => {
    if (!open || session?.status !== "connected") return;
    const timer = window.setTimeout(() => onOpenChange(false), 1200);
    return () => window.clearTimeout(timer);
  }, [open, session?.status, onOpenChange]);

  const refreshQr = async () => {
    setBusy(true);
    setError(null);
    setCountdown(20);
    const result = await triggerSessionAction("refresh_qr", slot);
    if (!result.success) setError(result.error ?? "Could not refresh the QR code.");
    await refetch();
    setBusy(false);
  };

  const connected = session?.status === "connected";
  const qr = session?.qr_payload ?? null;
  const statusLabel = session?.status?.replaceAll("_", " ") ?? "disconnected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Connect {slot === "main" ? "Official Main" : slot === "bulk" ? "Company Bulk" : "Personal"} WhatsApp</DialogTitle>
          <DialogDescription>Scan this QR code using WhatsApp on the device you want to link.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {connected ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
              <p className="text-lg font-semibold text-green-700">Connected</p>
              {session?.phone_number && <p className="text-sm text-muted-foreground">{session.phone_number}</p>}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          ) : qr?.startsWith("data:image/") ? (
            <>
              <div className="rounded-xl border bg-white p-2">
                <img src={qr} alt="WhatsApp link-device QR code" className="h-64 w-64 object-contain" />
              </div>
              <Badge variant={countdown > 5 ? "secondary" : "destructive"}>Refresh reminder in {countdown}s</Badge>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Waiting for the gateway QR code…</p>
              <Badge variant="outline">Session: {statusLabel}</Badge>
            </div>
          )}
          <div className="space-y-1 text-center text-sm text-muted-foreground">
            <p>1. Open <strong>WhatsApp</strong> on your phone.</p>
            <p>2. Go to <strong>Linked devices → Link a device</strong>.</p>
            <p>3. Scan the QR shown above.</p>
          </div>
          {!connected && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void refreshQr()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh QR
              </Button>
              <Button variant="ghost" onClick={() => void refetch()}>Check status</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
