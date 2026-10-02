import React from "react";
import { Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { REMINDER_OPTIONS } from "@/constants/taskConstants";

interface CustomerTaskScheduleFieldsProps {
  fieldPrefix: string;
  dueDate: string;
  dueTime: string;
  reminderEnabled: boolean;
  reminderTime: string;
  minDate: string;
  validationErrors?: Record<string, string>;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onReminderEnabledChange: (enabled: boolean) => void;
  onReminderTimeChange: (value: string) => void;
}

const TIME_PRESETS = [
  { label: "Morning", value: "10:00" },
  { label: "Afternoon", value: "14:00" },
  { label: "Evening", value: "17:00" },
];

export function CustomerTaskScheduleFields({
  fieldPrefix,
  dueDate,
  dueTime,
  reminderEnabled,
  reminderTime,
  minDate,
  validationErrors = {},
  onDueDateChange,
  onDueTimeChange,
  onReminderEnabledChange,
  onReminderTimeChange,
}: CustomerTaskScheduleFieldsProps) {
  const dateId = fieldPrefix + "-due-date";
  const timeId = fieldPrefix + "-due-time";
  const reminderId = fieldPrefix + "-reminder";
  const reminderTimeId = fieldPrefix + "-reminder-time";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={dateId}>Due date</Label>
          <Input
            id={dateId}
            type="date"
            value={dueDate}
            min={minDate}
            onChange={(event) => onDueDateChange(event.target.value)}
            className={
              validationErrors.dueDate ? "min-h-11 border-destructive" : "min-h-11"
            }
          />
          {validationErrors.dueDate && (
            <p className="text-sm text-destructive">{validationErrors.dueDate}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={timeId}>Due time</Label>
          <Input
            id={timeId}
            type="time"
            value={dueTime}
            onChange={(event) => onDueTimeChange(event.target.value)}
            className="min-h-11"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TIME_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={dueTime === preset.value ? "default" : "outline"}
            className="min-h-11 flex-1 sm:flex-none"
            onClick={() => onDueTimeChange(preset.value)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id={reminderId}
          checked={reminderEnabled}
          onCheckedChange={(checked) => onReminderEnabledChange(checked === true)}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={reminderId} className="cursor-pointer font-medium">
            Set reminder
          </Label>
          {reminderEnabled && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={reminderTime} onValueChange={onReminderTimeChange}>
                <SelectTrigger id={reminderTimeId} className="min-h-11 w-full">
                  <SelectValue placeholder="Select reminder time" />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Business hours: 9:00 AM – 7:00 PM
      </p>
    </div>
  );
}
