import React from "react";
import { Badge } from "@/components/ui/badge";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";

export function WhatsAppHeaderChip() {
  const { isAdmin, isGatewayOnline, slotStatus, settings, loading } = useWhatsAppSettings();
  if (!isAdmin || loading) return null;

  const mainSlot = slotStatus?.slots?.main;
  const bulkSlot = slotStatus?.slots?.bulk;
  const isSafetyPaused = Boolean(mainSlot?.paused || bulkSlot?.paused);
  const anyConnected = mainSlot?.status === "connected" || bulkSlot?.status === "connected";

  let label = "Gateway Offline";
  let variant: "default" | "secondary" | "destructive" | "outline" = "destructive";

  if (settings?.kill_switch) {
    label = "Kill Switch On";
    variant = "destructive";
  } else if (isSafetyPaused) {
    label = "Safety Pause";
    variant = "destructive";
  } else if (isGatewayOnline && anyConnected) {
    label = "WhatsApp Online";
    variant = "secondary";
  } else if (isGatewayOnline) {
    label = "Gateway Online (Unlinked)";
    variant = "outline";
  }

  return <Badge variant={variant}>{label}</Badge>;
}
