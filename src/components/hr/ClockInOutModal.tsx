import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Camera, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClockInOutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "clock-in" | "clock-out";
  onSuccess: () => void;
}

type PermissionStatus = "requesting" | "acquired" | "denied";

export function ClockInOutModal({ open, onOpenChange, mode, onSuccess }: ClockInOutModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [gpsStatus, setGpsStatus] = useState<PermissionStatus>("requesting");
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>("requesting");
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Request permissions when modal opens
  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      setStep(1);
      setGpsStatus("requesting");
      setCameraStatus("requesting");
      setGpsPosition(null);
      setError(null);
      stopCamera();
      return;
    }

    cancelledRef.current = false;

    const requestCamera = async () => {
      if (cancelledRef.current) return;
      setCameraStatus("requesting");
      try {
        // Try front camera first
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        if (!cancelledRef.current) {
          streamRef.current = stream;
          setCameraStatus("acquired");
        } else {
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch {
        // Fallback: try any camera without facingMode constraint
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (!cancelledRef.current) {
            streamRef.current = stream;
            setCameraStatus("acquired");
          } else {
            stream.getTracks().forEach((t) => t.stop());
          }
        } catch {
          if (!cancelledRef.current) setCameraStatus("denied");
        }
      }
    };

    // Request GPS first, then camera after GPS resolves
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelledRef.current) {
          setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsStatus("acquired");
          requestCamera();
        }
      },
      () => {
        if (!cancelledRef.current) {
          setGpsStatus("denied");
          // Still request camera even if GPS denied
          requestCamera();
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    return () => {
      cancelledRef.current = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  // Attach stream to video when entering step 2
  useEffect(() => {
    if (step === 2 && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [step]);

  const retryPermissions = async () => {
    setGpsStatus("requesting");
    setCameraStatus("requesting");
    setGpsPosition(null);
    stopCamera();

    const requestCamera = async () => {
      if (cancelledRef.current) return;
      setCameraStatus("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        if (!cancelledRef.current) {
          streamRef.current = stream;
          setCameraStatus("acquired");
        } else {
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (!cancelledRef.current) {
            streamRef.current = stream;
            setCameraStatus("acquired");
          } else {
            stream.getTracks().forEach((t) => t.stop());
          }
        } catch {
          if (!cancelledRef.current) setCameraStatus("denied");
        }
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelledRef.current) {
          setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsStatus("acquired");
          requestCamera();
        }
      },
      () => {
        if (!cancelledRef.current) {
          setGpsStatus("denied");
          requestCamera();
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleContinue = () => setStep(2);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !gpsPosition) return;
    setSubmitting(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);

      stopCamera();

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to capture"))),
          "image/jpeg",
          0.8
        );
      });

      const formData = new FormData();
      formData.append("photo", blob, "capture.jpg");
      formData.append("latitude", String(gpsPosition.lat));
      formData.append("longitude", String(gpsPosition.lng));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const functionName = mode === "clock-in" ? "hr-clock-in" : "hr-clock-out";
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/${functionName}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to process");
      }

      const time = new Date(result.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (mode === "clock-in") {
        toast.success(`Clocked in at ${time} ✓`, {
          description: result.flagged ? "⚠ GPS flagged: outside radius" : "GPS verified",
        });
      } else {
        toast.success(`Clocked out at ${time} ✓`, {
          description: `${result.total_hours}h worked${result.overtime_hours > 0 ? ` (${result.overtime_hours}h overtime)` : ""}`,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Capture error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      // Re-acquire camera for retry
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        // Camera re-acquire failed
      }
    } finally {
      setSubmitting(false);
    }
  };

  const StatusIcon = ({ status }: { status: PermissionStatus }) => {
    if (status === "requesting") return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    if (status === "acquired") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-destructive" />;
  };

  const statusLabel = (status: PermissionStatus) => {
    if (status === "requesting") return "Requesting...";
    if (status === "acquired") return "Ready ✓";
    return "Denied ✗";
  };

  const bothReady = gpsStatus === "acquired" && cameraStatus === "acquired";
  const anyDenied = gpsStatus === "denied" || cameraStatus === "denied";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "clock-in" ? "Clock In" : "Clock Out"}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              We need camera and location access to verify your attendance.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">GPS Location</span>
                <StatusIcon status={gpsStatus} />
                <span className="text-xs text-muted-foreground">{statusLabel(gpsStatus)}</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Camera className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">Camera</span>
                <StatusIcon status={cameraStatus} />
                <span className="text-xs text-muted-foreground">{statusLabel(cameraStatus)}</span>
              </div>
            </div>

            {anyDenied && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm space-y-2">
                <p className="font-medium">Permission denied</p>
                <p>
                  Please allow{gpsStatus === "denied" ? " location" : ""}
                  {gpsStatus === "denied" && cameraStatus === "denied" ? " and" : ""}
                  {cameraStatus === "denied" ? " camera" : ""} access, then tap Retry below.
                </p>
                <p className="text-xs text-muted-foreground">
                  On mobile: tap the lock/info icon in your browser address bar → Site settings → enable permissions.
                  On desktop: click the camera/location icon in the address bar.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={retryPermissions}
                >
                  Retry Permissions
                </Button>
              </div>
            )}

            <Button onClick={handleContinue} disabled={!bothReady} className="w-full">
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] max-h-[400px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {/* Viewfinder overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full border-2 border-white/50" />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 text-green-500" />
              Location acquired
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              onClick={handleCapture}
              disabled={submitting}
              className={`w-full h-12 text-base font-semibold ${
                mode === "clock-in"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-orange-500 hover:bg-orange-600 text-white"
              }`}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Camera className="h-5 w-5 mr-2" />
              )}
              {submitting
                ? "Processing..."
                : mode === "clock-in"
                ? "Capture & Clock In"
                : "Capture & Clock Out"}
            </Button>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
