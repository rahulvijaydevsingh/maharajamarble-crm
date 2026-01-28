import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { TASK_TYPES, DUE_DATE_OPTIONS, ASSIGNEE_OPTIONS, REMINDER_TIMING_OPTIONS, TIME_OFFSET_UNITS } from "@/constants/automationConstants";
import { RecurrenceSection } from "@/components/tasks/form/RecurrenceSection";

interface CreateTaskActionConfigProps {
  config: Record<string, any>;
  onConfigChange: (updates: Record<string, any>) => void;
  entityType: string;
}

export const CreateTaskActionConfig = ({ config, onConfigChange }: CreateTaskActionConfigProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  const handleChange = (field: string, value: any) => {
    onConfigChange({ ...config, [field]: value });
  };

  const handleRecurrenceChange = (updates: Record<string, any>) => {
    const recurrenceData = {
      ...config.recurrence,
      ...updates,
    };
    onConfigChange({ ...config, recurrence: recurrenceData });
  };

  // Get recurrence data with defaults
  const recurrenceData = {
    isRecurring: config.recurrence?.isRecurring || false,
    frequency: config.recurrence?.frequency || "one-time",
    interval: config.recurrence?.interval || 1,
    daysOfWeek: config.recurrence?.daysOfWeek || [],
    dayOfMonth: config.recurrence?.dayOfMonth || null,
    resetFromCompletion: config.recurrence?.resetFromCompletion || false,
    endType: config.recurrence?.endType || "never",
    endDate: config.recurrence?.endDate ? new Date(config.recurrence.endDate) : undefined,
    occurrencesLimit: config.recurrence?.occurrencesLimit || null,
  };

  return (
    <div className="space-y-4">
      {/* Task Title */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Task Title *
          <Info className="h-3 w-3 text-muted-foreground" />
        </Label>
        <Input
          value={config.title || ""}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder='e.g., "First Call - {{trigger.name}}"'
        />
        <p className="text-xs text-muted-foreground">
          Use {"{{trigger.name}}"}, {"{{trigger.phone}}"} for dynamic values
        </p>
      </div>

      {/* Task Type */}
      <div className="space-y-2">
        <Label>Task Type</Label>
        <Select
          value={config.type || "Follow-up Call"}
          onValueChange={(v) => handleChange("type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={config.priority || "Medium"}
          onValueChange={(v) => handleChange("priority", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Assigned To */}
      <div className="space-y-2">
        <Label>Assigned To</Label>
        <Select
          value={config.assigned_to_type || "trigger.assigned_to"}
          onValueChange={(v) => handleChange("assigned_to_type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNEE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {config.assigned_to_type === "specific_user" && (
          <Input
            className="mt-2"
            value={config.assigned_to || ""}
            onChange={(e) => handleChange("assigned_to", e.target.value)}
            placeholder="Enter user name"
          />
        )}
      </div>

      {/* Due Date Configuration */}
      <Card className="p-4 space-y-3">
        <Label className="font-medium">Due Date & Time</Label>
        
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Due Date Calculation</Label>
          <Select
            value={config.due_date_type || "today"}
            onValueChange={(v) => handleChange("due_date_type", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUE_DATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {config.due_date_type === "relative" && (
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number"
              min="0"
              value={config.due_offset_value || 0}
              onChange={(e) => handleChange("due_offset_value", parseInt(e.target.value) || 0)}
              placeholder="Value"
            />
            <Select
              value={config.due_offset_unit || "days"}
              onValueChange={(v) => handleChange("due_offset_unit", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OFFSET_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">from now</div>
          </div>
        )}

        {/* Due Time */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Due Time</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={config.due_time_type || "relative"}
              onValueChange={(v) => handleChange("due_time_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current time</SelectItem>
                <SelectItem value="relative">+ X hours from now</SelectItem>
                <SelectItem value="specific">Specific time</SelectItem>
              </SelectContent>
            </Select>
            {config.due_time_type === "relative" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  className="w-20"
                  value={config.due_time_offset || 2}
                  onChange={(e) => handleChange("due_time_offset", parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
            )}
            {config.due_time_type === "specific" && (
              <Input
                type="time"
                value={config.due_time || "10:00"}
                onChange={(e) => handleChange("due_time", e.target.value)}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Reminder */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-medium">Enable Reminder</Label>
          <Switch
            checked={config.reminder_enabled || false}
            onCheckedChange={(checked) => handleChange("reminder_enabled", checked)}
          />
        </div>
        {config.reminder_enabled && (
          <Select
            value={config.reminder_before || "15"}
            onValueChange={(v) => handleChange("reminder_before", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_TIMING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Card>

      {/* Related Entity */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-medium">Link to Trigger Record</Label>
          <Switch
            checked={config.link_to_trigger !== false}
            onCheckedChange={(checked) => handleChange("link_to_trigger", checked)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Automatically links this task to the lead/customer/professional that triggered the automation
        </p>
      </Card>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description / Notes</Label>
        <Textarea
          value={config.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder='e.g., "Follow up on {{trigger.material_interests}}"'
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Supports variables like {"{{trigger.name}}"}, {"{{trigger.material_interests}}"}
        </p>
      </div>

      {/* Advanced Options - Recurrence */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-2 hover:text-primary transition-colors">
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Advanced Options (Recurrence)
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <RecurrenceSection
            data={recurrenceData}
            onChange={handleRecurrenceChange}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};