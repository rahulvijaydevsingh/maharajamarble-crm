import React, { useState } from "react";
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

const CUSTOM_REMINDER_VALUE = "custom";

const CUSTOM_UNITS = [
  { value: "minutes", label: "Minutes", minutes: 1 },
  { value: "hours", label: "Hours", minutes: 60 },
  { value: "days", label: "Days", minutes: 1440 },
] as const;

type CustomUnit = (typeof CUSTOM_UNITS)[number]["value"];

// Reminders are stored as whole minutes before the due time, between 1 minute and 30 days.
export const MAX_REMINDER_MINUTES = 43200;

export function isValidReminderMinutes(value: string): boolean {
  return (
    /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_REMINDER_MINUTES
  );
}

function splitMinutes(value: string): { amount: string; unit: CustomUnit } {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1) {
    return { amount: "", unit: "minutes" };
  }
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: "days" };
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: "hours" };
  return { amount: String(minutes), unit: "minutes" };
}

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
  const customAmountId = fieldPrefix + "-reminder-custom-amount";

  const startsAsCustom = !REMINDER_OPTIONS.some((option) => option.value === reminderTime);
  const [customMode, setCustomMode] = useState(startsAsCustom);
  const [customAmount, setCustomAmount] = useState(() => splitMinutes(reminderTime).amount);
  const [customUnit, setCustomUnit] = useState<CustomUnit>(() => splitMinutes(reminderTime).unit);

  const emitCustomMinutes = (amount: string, unit: CustomUnit) => {
    const multiplier = CUSTOM_UNITS.find((item) => item.value === unit)?.minutes ?? 1;
    const parsed = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      onReminderTimeChange("");
      return;
    }
    onReminderTimeChange(String(Math.round(parsed * multiplier)));
  };

  const handleReminderSelect = (value: string) => {
    if (value === CUSTOM_REMINDER_VALUE) {
      // Always start in minutes so a typed number never gets silently multiplied by a unit.
      const current = Number(reminderTime);
      setCustomMode(true);
      setCustomAmount(Number.isInteger(current) && current >= 1 ? String(current) : "");
      setCustomUnit("minutes");
      return;
    }
    setCustomMode(false);
    onReminderTimeChange(value);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-3">
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
      {validationErrors.dueDate && (
        <p className="text-sm text-destructive">{validationErrors.dueDate}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TIME_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={dueTime === preset.value ? "default" : "outline"}
            className="min-h-11 min-w-[5.5rem] flex-1 sm:flex-none"
            onClick={() => onDueTimeChange(preset.value)}
          >
            {preset.label}
          </Button>
        ))}

        <div className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3">
          <Checkbox
            id={reminderId}
            checked={reminderEnabled}
            onCheckedChange={(checked) => onReminderEnabledChange(checked === true)}
          />
          <Label htmlFor={reminderId} className="cursor-pointer whitespace-nowrap font-medium">
            Set reminder
          </Label>
        </div>

        {reminderEnabled && (
          <div className="min-w-[10rem] flex-1 sm:w-48 sm:flex-none">
            <Select
              value={customMode ? CUSTOM_REMINDER_VALUE : reminderTime}
              onValueChange={handleReminderSelect}
            >
              <SelectTrigger
                id={reminderTimeId}
                aria-label="Reminder time"
                className="min-h-11 w-full"
              >
                <SelectValue placeholder="Reminder time" />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_REMINDER_VALUE}>Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {reminderEnabled && customMode && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              id={customAmountId}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={customAmount}
              aria-label="Custom reminder amount"
              placeholder="e.g. 45"
              onChange={(event) => {
                setCustomAmount(event.target.value);
                emitCustomMinutes(event.target.value, customUnit);
              }}
              className={
                validationErrors.reminderTime
                  ? "min-h-11 w-24 border-destructive"
                  : "min-h-11 w-24"
              }
            />
            <Select
              value={customUnit}
              onValueChange={(value) => {
                setCustomUnit(value as CustomUnit);
                emitCustomMinutes(customAmount, value as CustomUnit);
              }}
            >
              <SelectTrigger aria-label="Custom reminder unit" className="min-h-11 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label} before
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {reminderEnabled && validationErrors.reminderTime && (
        <p className="text-sm text-destructive">{validationErrors.reminderTime}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Business hours: 9:00 AM – 7:00 PM
      </p>
    </div>
  );
}
