import React from "react";
import { Badge } from "@/components/ui/badge";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";

export function WhatsAppHeaderChip() {
  const { isAdmin, isGatewayOnline, slotStatus, settings, loading } = useWhatsAppSettings();
  if (!isAdmin || loading) return null;
  let label = "Gateway Offline";
  let variant: "default" | "secondary" | "destructive" | "outline" = "destructive";
  if (settings?.kill_switch) {
    label = "Kill Switch On";
    variant = "destructive";
  } else if (settings?.paused || slotStatus?.paused) {
    label = "Safety Pause";
    variant = "destructive";
  } else if (isGatewayOnline) {
    label = "WhatsApp Online";
    variant = "secondary";
  }
  return <Badge variant={variant}>{label}</Badge>;
}
