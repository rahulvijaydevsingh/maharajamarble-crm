import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";
import { MessageCircle, Save, Loader2, Shield, Zap, Clock, AlertTriangle } from "lucide-react";

export function WhatsAppSettingsPanel() {
  const { settings, loading, saving, updateSettings } = useWhatsAppSettings();
  const [localSettings, setLocalSettings] = React.useState<any>(null);

  React.useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings({ ...settings });
    }
  }, [settings]);

  if (loading || !localSettings) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const handleSave = () => {
    const { id, updated_at, ...updates } = localSettings;
    updateSettings(updates);
  };

  const isEnabled = localSettings.module_enabled;

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp Integration
          </CardTitle>
          <CardDescription>
            Send WhatsApp messages directly from the CRM using Evolution API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable WhatsApp Module</p>
              <p className="text-sm text-muted-foreground">
                Turn on WhatsApp messaging for all users
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, module_enabled: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Configuration - greyed out when disabled */}
      <div className={!isEnabled ? "opacity-50 pointer-events-none" : ""}>
        {!isEnabled && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Enable the WhatsApp module above to configure settings.
            </AlertDescription>
          </Alert>
        )}

        {/* Connection Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-4 w-4" />
              API Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Evolution API URL</Label>
              <Input
                placeholder="https://evolution-api-xxxxx.up.railway.app"
                value={localSettings.evolution_api_url || ""}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, evolution_api_url: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Your Railway-hosted Evolution API URL. The API key is stored securely as a backend secret.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Bulk SIM Instance Name</Label>
              <Input
                placeholder="e.g. bulk_sim_01"
                value={localSettings.bulk_instance_name || ""}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, bulk_instance_name: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                The Evolution API instance reserved for bulk messages only
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rate Limits */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-4 w-4" />
              Rate Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Daily Limit — Main Number</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={localSettings.daily_limit_main}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, daily_limit_main: parseInt(e.target.value) || 200 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Daily Limit — Bulk SIM</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={localSettings.daily_limit_bulk}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, daily_limit_bulk: parseInt(e.target.value) || 100 })
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Delay Between Messages: {localSettings.delay_between_msgs_seconds}s
              </Label>
              <Slider
                value={[localSettings.delay_between_msgs_seconds]}
                min={5}
                max={60}
                step={1}
                onValueChange={([v]) =>
                  setLocalSettings({ ...localSettings, delay_between_msgs_seconds: v })
                }
              />
              <p className="text-xs text-muted-foreground">
                Minimum delay between automated sends (5-60 seconds)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Automation */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">Automation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-send Quotations</p>
                <p className="text-sm text-muted-foreground">
                  Automatically send PDF when quotation is marked "Sent"
                </p>
              </div>
              <Switch
                checked={localSettings.auto_send_quotations}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, auto_send_quotations: checked })
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-send Reminders</p>
                <p className="text-sm text-muted-foreground">
                  Send WhatsApp for reminders due in the next hour
                </p>
              </div>
              <Switch
                checked={localSettings.auto_send_reminders}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, auto_send_reminders: checked })
                }
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleSave} disabled={saving} className="ml-auto">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save WhatsApp Settings
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
