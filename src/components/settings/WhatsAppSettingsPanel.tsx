import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";
import { useWhatsAppSession } from "@/hooks/useWhatsAppSession";
import { WhatsAppConnectModal } from "@/components/whatsapp/WhatsAppConnectModal";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, ShieldAlert, RadioTower, MessageCircle, Power, Pause, Play, LogOut, QrCode, AlertTriangle } from "lucide-react";

type CompanySlot = "main" | "bulk";

export function WhatsAppSettingsPanel() {
  const { settings, loading, saving, updateSettings, workerInstances, isGatewayOnline, isAdmin } = useWhatsAppSettings();
  const { sessionsBySlot, triggerSessionAction } = useWhatsAppSession();
  const auth = useAuth();
  const [local, setLocal] = useState<Record<string, any>>({});
  const [connectSlot, setConnectSlot] = useState<CompanySlot | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setLocal({ ...settings });
  }, [settings]);

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;
  }
  if (!isAdmin) {
    return <Alert><ShieldAlert className="h-4 w-4" /><AlertDescription>WhatsApp administration is available to administrators only.</AlertDescription></Alert>;
  }
  if (!settings) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>WhatsApp settings could not be loaded.</AlertDescription></Alert>;
  }

  const latestHeartbeat = workerInstances.reduce((latest: string | null, worker) =>
    !latest || new Date(worker.last_seen_at).getTime() > new Date(latest).getTime() ? worker.last_seen_at : latest, null);
  const heartbeatAge = latestHeartbeat ? Math.max(0, Math.floor((Date.now() - new Date(latestHeartbeat).getTime()) / 1000)) : null;

  const setValue = (key: string, value: any) => setLocal((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const { id: _id, updated_at: _updatedAt, evolution_api_url: _oldUrl, bulk_instance_name: _oldBulk, ...payload } = local;
    await updateSettings(payload);
  };
  const runAction = async (slot: CompanySlot, action: "pause" | "resume" | "disconnect" | "logout") => {
    const key = slot + ":" + action;
    setActionBusy(key);
    await triggerSessionAction(action, slot);
    setActionBusy(null);
  };
  const renderSlot = (slot: CompanySlot, title: string) => {
    const session = sessionsBySlot[slot];
    const paused = Boolean(session?.paused) || session?.status === "paused_safety";
    const status = session?.status?.replaceAll("_", " ") ?? "disconnected";
    return (
      <Card key={slot}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg"><MessageCircle className="h-4 w-4" />{title}</CardTitle>
            <Badge variant={session?.status === "connected" && !paused ? "secondary" : paused ? "destructive" : "outline"}>{status}</Badge>
          </div>
          <CardDescription>{session?.phone_number ?? "No phone number connected"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConnectSlot(slot)}><QrCode className="mr-2 h-4 w-4" />{session?.status === "connected" ? "View session" : "Connect / QR"}</Button>
          {paused
            ? <Button size="sm" variant="outline" disabled={actionBusy === slot + ":resume"} onClick={() => void runAction(slot, "resume")}><Play className="mr-2 h-4 w-4" />Resume</Button>
            : <Button size="sm" variant="outline" disabled={actionBusy === slot + ":pause"} onClick={() => void runAction(slot, "pause")}><Pause className="mr-2 h-4 w-4" />Pause</Button>}
          <Button size="sm" variant="outline" disabled={actionBusy === slot + ":disconnect"} onClick={() => void runAction(slot, "disconnect")}><Power className="mr-2 h-4 w-4" />Disconnect</Button>
          <Button size="sm" variant="destructive" disabled={actionBusy === slot + ":logout"} onClick={() => void runAction(slot, "logout")}><LogOut className="mr-2 h-4 w-4" />Logout</Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RadioTower className="h-5 w-5" /> Gateway & Worker Status</CardTitle>
          <CardDescription>Preview/production worker heartbeat as reported by the gateway instance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isGatewayOnline ? "secondary" : "destructive"}>{isGatewayOnline ? "Gateway Online" : "Gateway Offline"}</Badge>
            <span className="text-sm text-muted-foreground">{workerInstances.length} worker instance(s)</span>
            {heartbeatAge !== null && <span className="text-sm text-muted-foreground">Latest heartbeat: {heartbeatAge}s ago</span>}
          </div>
          <div className="space-y-1">
            {workerInstances.map((worker) => (
              <div key={worker.worker_id} className="flex flex-wrap justify-between gap-2 rounded border p-2 text-sm">
                <span>{worker.host_label || worker.worker_id} · {worker.app_env}</span>
                <span className="text-muted-foreground">{worker.version || "unknown"} · {Math.max(0, Math.floor((Date.now() - new Date(worker.last_seen_at).getTime()) / 1000))}s ago</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><p className="font-medium">Emergency Kill Switch</p><p className="text-xs text-muted-foreground">Stops all outbound sends.</p></div>
            <Switch checked={Boolean(local.kill_switch)} onCheckedChange={(value) => { setValue("kill_switch", value); void updateSettings({ kill_switch: value }); }} />
          </div>
          {local.kill_switch && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertDescription>Kill Switch is ON. All outbound WhatsApp sends are halted.</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {renderSlot("main", "Official Main WhatsApp")}
        {renderSlot("bulk", "Company Bulk WhatsApp")}
      </div>

      <Card>
        <CardHeader><CardTitle>Shared Slots Testing Gate</CardTitle><CardDescription>Allows controlled shared-slot use during internal testing.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between"><Label htmlFor="allow-shared">Allow shared slots</Label><Switch id="allow-shared" checked={Boolean(local.allow_shared_slots)} onCheckedChange={(value) => setValue("allow_shared_slots", value)} /></div>
          {local.allow_shared_slots && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Testing mode is enabled. Shared company WhatsApp slots can be used by permitted staff.</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sending Rails & Anti-Ban Configuration</CardTitle><CardDescription>Company sending pace, daily caps, business hours and safety controls.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[
            ["pace_min_seconds", "Minimum pace (seconds)"],
            ["pace_max_seconds", "Maximum pace (seconds)"],
            ["daily_limit_main", "Main daily limit"],
            ["daily_limit_bulk", "Bulk daily limit"],
            ["main_new_recipient_cap", "Main new recipients/day"],
            ["bulk_new_recipient_cap", "Bulk new recipients/day"],
            ["max_consecutive_failures", "Failures before safety pause"],
          ].map(([key, label]) => <div key={key} className="space-y-1"><Label>{label}</Label><Input type="number" min={1} value={local[key] ?? ""} onChange={(e) => setValue(key, Number(e.target.value))} /></div>)}
          <div className="space-y-1"><Label>Business hours start (IST)</Label><Input type="time" value={String(local.business_hours_start ?? "09:30").slice(0,5)} onChange={(e) => setValue("business_hours_start", e.target.value)} /></div>
          <div className="space-y-1"><Label>Business hours end (IST)</Label><Input type="time" value={String(local.business_hours_end ?? "18:30").slice(0,5)} onChange={(e) => setValue("business_hours_end", e.target.value)} /></div>
          <div className="flex items-center justify-between rounded border p-3"><Label>Bulk sends within business hours only</Label><Switch checked={Boolean(local.bulk_business_hours_only)} onCheckedChange={(value) => setValue("bulk_business_hours_only", value)} /></div>
          <div className="flex items-center justify-between rounded border p-3"><Label>Warm-up limits enabled</Label><Switch checked={local.warmup_enabled !== false} onCheckedChange={(value) => setValue("warmup_enabled", value)} /></div>
        </CardContent>
        <CardFooter><Button onClick={() => void save()} disabled={saving} className="ml-auto">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Rails & Settings</Button></CardFooter>
      </Card>

      <Card>
        <CardHeader><CardTitle>Showroom Location Pin Settings</CardTitle><CardDescription>Coordinates used by the server when resolving the showroom location placeholder.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Showroom name</Label><Input value={local.showroom_name ?? ""} onChange={(e) => setValue("showroom_name", e.target.value)} /></div>
          <div className="space-y-1"><Label>Showroom address</Label><Input value={local.showroom_address ?? ""} onChange={(e) => setValue("showroom_address", e.target.value)} /></div>
          <div className="space-y-1"><Label>Latitude</Label><Input type="number" value={local.showroom_lat ?? ""} onChange={(e) => setValue("showroom_lat", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Longitude</Label><Input type="number" value={local.showroom_lng ?? ""} onChange={(e) => setValue("showroom_lng", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Google Maps URL</Label><Input value={local.showroom_maps_url ?? ""} onChange={(e) => setValue("showroom_maps_url", e.target.value)} /></div>
        </CardContent>
        <CardFooter><Button onClick={() => void save()} disabled={saving} className="ml-auto">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Showroom Pin</Button></CardFooter>
      </Card>

      <WhatsAppConnectModal
        open={connectSlot !== null}
        onOpenChange={(open) => { if (!open) setConnectSlot(null); }}
        userId={auth.user?.id}
        slot={connectSlot ?? "main"}
      />
    </div>
  );
}
