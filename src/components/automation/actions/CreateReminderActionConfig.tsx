import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useActiveStaff } from "@/hooks/useActiveStaff";

interface CreateReminderActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

const ASSIGNEE_OPTIONS = [
  { value: "trigger.assigned_to", label: "Same as trigger record's assigned user" },
  { value: "trigger.created_by", label: "Same as trigger record's creator" },
  { value: "specific_user", label: "Specific user" },
];

const REMINDER_OFFSET_UNITS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

export const CreateReminderActionConfig = ({ config, onConfigChange }: CreateReminderActionConfigProps) => {
  const { staffMembers } = useActiveStaff();
  
  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label>Reminder Title *</Label>
        <Input
          value={config.title || ""}
          onChange={(e) => updateConfig("title", e.target.value)}
          placeholder="e.g., Follow up on {{lead.name}}"
        />
        <p className="text-xs text-muted-foreground">
          Use {"{{trigger.field_name}}"} for dynamic values
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={config.description || ""}
          onChange={(e) => updateConfig("description", e.target.value)}
          placeholder="Additional details for the reminder..."
          rows={2}
        />
      </div>

      {/* Reminder DateTime */}
      <div className="space-y-2">
        <Label>Reminder Time</Label>
        <div className="flex items-center gap-2">
          <Select
            value={config.reminder_datetime_type || "relative"}
            onValueChange={(v) => updateConfig("reminder_datetime_type", v)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relative">In</SelectItem>
              <SelectItem value="absolute">At specific time</SelectItem>
            </SelectContent>
          </Select>

          {config.reminder_datetime_type === "relative" || !config.reminder_datetime_type ? (
            <>
              <Input
                type="number"
                value={config.reminder_offset || 1}
                onChange={(e) => updateConfig("reminder_offset", parseInt(e.target.value) || 1)}
                className="w-20"
                min={1}
              />
              <Select
                value={config.reminder_offset_unit || "days"}
                onValueChange={(v) => updateConfig("reminder_offset_unit", v)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OFFSET_UNITS.map(u => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">from now</span>
            </>
          ) : (
            <Input
              type="datetime-local"
              value={config.reminder_datetime_absolute || ""}
              onChange={(e) => updateConfig("reminder_datetime_absolute", e.target.value)}
              className="flex-1"
            />
          )}
        </div>
      </div>

      {/* Assigned To */}
      <div className="space-y-2">
        <Label>Assigned To</Label>
        <Select
          value={config.assigned_to_type || "trigger.assigned_to"}
          onValueChange={(v) => updateConfig("assigned_to_type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNEE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {config.assigned_to_type === "specific_user" && (
          <Select
            value={config.assigned_to_user || ""}
            onValueChange={(v) => updateConfig("assigned_to_user", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select user..." />
            </SelectTrigger>
            <SelectContent>
              {staffMembers.map(member => (
                <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Recurring Toggle */}
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label>Recurring Reminder</Label>
          <p className="text-xs text-muted-foreground">Repeat this reminder on a schedule</p>
        </div>
        <Switch
          checked={config.is_recurring || false}
          onCheckedChange={(checked) => updateConfig("is_recurring", checked)}
        />
      </div>

      {config.is_recurring && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <Label>Recurrence Pattern</Label>
          <Select
            value={config.recurrence_pattern || "daily"}
            onValueChange={(v) => updateConfig("recurrence_pattern", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
