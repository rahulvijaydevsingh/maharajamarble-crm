import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle, XCircle, Smartphone } from "lucide-react";
import { useWhatsAppSession } from "@/hooks/useWhatsAppSession";

interface WhatsAppConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function WhatsAppConnectModal({ open, onOpenChange, userId }: WhatsAppConnectModalProps) {
  const { session, createSession, checkStatus, refetch } = useWhatsAppSession(userId);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = () => {
    pollingRef.current = setInterval(async () => {
      const status = await checkStatus();
      if (status === "connected" || status === "open") {
        setConnected(true);
        stopPolling();
        setTimeout(() => onOpenChange(false), 1500);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const generateQR = async () => {
    setQrLoading(true);
    setError(null);
    setConnected(false);
    setCountdown(60);

    const result = await createSession();
    if (result.error) {
      setError(result.error);
      setQrLoading(false);
      return;
    }

    setQrCode(result.qrCode || null);
    setQrLoading(false);

    // Start countdown
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopPolling();
          setQrCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    startPolling();
  };

  useEffect(() => {
    if (open && !session?.phone_number) {
      generateQR();
    }
    return () => stopPolling();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { stopPolling(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Connect WhatsApp
          </DialogTitle>
          <DialogDescription>
            Scan the QR code with your phone to link WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {connected ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-semibold text-green-700">Connected!</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button onClick={generateQR} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : qrLoading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating QR code...</p>
            </div>
          ) : qrCode ? (
            <>
              <div className="border-4 border-primary/20 rounded-xl p-2 bg-white">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="WhatsApp QR Code"
                  className="w-64 h-64 object-contain"
                />
              </div>
              <Badge variant={countdown > 15 ? "secondary" : "destructive"}>
                QR expires in {countdown}s
              </Badge>
              <div className="text-sm text-muted-foreground text-center space-y-1">
                <p>1. Open <strong>WhatsApp</strong> on your phone</p>
                <p>2. Tap <strong>⋮ Menu → Linked Devices → Link a Device</strong></p>
                <p>3. Point your phone camera at this QR code</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">QR code expired</p>
              <Button onClick={generateQR} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh QR Code
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
