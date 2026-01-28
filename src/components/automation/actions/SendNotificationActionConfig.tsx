import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NOTIFICATION_PRIORITIES, RECIPIENT_OPTIONS } from "@/constants/automationConstants";

interface SendNotificationActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (updates: Record<string, any>) => void;
}

export const SendNotificationActionConfig = ({ config, onConfigChange }: SendNotificationActionConfigProps) => {
  const handleChange = (field: string, value: any) => {
    onConfigChange({ ...config, [field]: value });
  };

  const toggleRecipient = (value: string) => {
    const currentRecipients = config.recipients || [];
    if (currentRecipients.includes(value)) {
      handleChange("recipients", currentRecipients.filter((r: string) => r !== value));
    } else {
      handleChange("recipients", [...currentRecipients, value]);
    }
  };

  const selectedRecipients = config.recipients || ["trigger.assigned_to"];

  return (
    <div className="space-y-4">
      {/* Recipients */}
      <Card className="p-4 space-y-3">
        <Label className="font-medium">Recipients *</Label>
        <div className="space-y-2">
          {RECIPIENT_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center space-x-2">
              <Checkbox
                id={opt.value}
                checked={selectedRecipients.includes(opt.value)}
                onCheckedChange={() => toggleRecipient(opt.value)}
              />
              <label
                htmlFor={opt.value}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {opt.label}
              </label>
            </div>
          ))}
        </div>
        {selectedRecipients.includes("specific_user") && (
          <Input
            className="mt-2"
            value={config.specific_users || ""}
            onChange={(e) => handleChange("specific_users", e.target.value)}
            placeholder="Enter user names (comma-separated)"
          />
        )}
        {selectedRecipients.includes("custom_email") && (
          <Input
            className="mt-2"
            value={config.custom_emails || ""}
            onChange={(e) => handleChange("custom_emails", e.target.value)}
            placeholder="Enter email addresses (comma-separated)"
          />
        )}
        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedRecipients.map((r: string) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {RECIPIENT_OPTIONS.find(o => o.value === r)?.label || r}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Notification Type */}
      <div className="space-y-2">
        <Label>Notification Type</Label>
        <Select
          value={config.notification_type || "in_app"}
          onValueChange={(v) => handleChange("notification_type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_app">In-App Only</SelectItem>
            <SelectItem value="email">Email Only</SelectItem>
            <SelectItem value="in_app_email">In-App + Email</SelectItem>
            <SelectItem value="all">All Channels (In-App + Email + SMS)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={config.priority || "normal"}
          onValueChange={(v) => handleChange("priority", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <div>
                  <span className="font-medium">{p.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">- {p.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Subject / Title */}
      <div className="space-y-2">
        <Label>Subject / Title *</Label>
        <Input
          value={config.title || ""}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder='e.g., "Lead Stuck Alert: {{trigger.name}}"'
          maxLength={150}
        />
        <p className="text-xs text-muted-foreground">
          Max 150 characters. Use {"{{trigger.name}}"} for dynamic values.
        </p>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <Label>Message *</Label>
        <Textarea
          value={config.message || ""}
          onChange={(e) => handleChange("message", e.target.value)}
          placeholder='e.g., "{{trigger.name}} has been in {{trigger.status}} stage for {{days_in_stage}} days. Please take action."'
          rows={4}
          maxLength={1000}
        />
        <p className="text-xs text-muted-foreground">
          Max 1000 characters. Supports variables like {"{{trigger.name}}"}, {"{{trigger.status}}"}, {"{{days_in_stage}}"}
        </p>
      </div>

      {/* Include Link */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium">Include Link to Record</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Shows a clickable link to the trigger record in the notification
            </p>
          </div>
          <Switch
            checked={config.include_link !== false}
            onCheckedChange={(checked) => handleChange("include_link", checked)}
          />
        </div>
      </Card>
    </div>
  );
};