import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  RECURRENCE_FREQUENCIES,
  DAYS_OF_WEEK,
  RECURRENCE_END_TYPES,
} from "@/constants/taskConstants";

interface RecurrenceData {
  isRecurring: boolean;
  frequency: string;
  interval: number;
  daysOfWeek: string[];
  dayOfMonth: number | null;
  resetFromCompletion: boolean;
  endType: string;
  endDate: Date | undefined;
  occurrencesLimit: number | null;
}

interface RecurrenceSectionProps {
  data: RecurrenceData;
  onChange: (data: Partial<RecurrenceData>) => void;
  disabled?: boolean;
}

export function RecurrenceSection({ data, onChange, disabled = false }: RecurrenceSectionProps) {
  const handleFrequencyChange = (frequency: string) => {
    onChange({
      frequency,
      isRecurring: frequency !== "one-time",
    });
  };

  const handleDayToggle = (day: string) => {
    const newDays = data.daysOfWeek.includes(day)
      ? data.daysOfWeek.filter((d) => d !== day)
      : [...data.daysOfWeek, day];
    onChange({ daysOfWeek: newDays });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">Recurrence Settings</span>
      </div>

      {/* Frequency Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Frequency</Label>
          <Select
            value={data.frequency}
            onValueChange={handleFrequencyChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_FREQUENCIES.map((freq) => (
                <SelectItem key={freq.value} value={freq.value}>
                  {freq.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.isRecurring && (
          <div className="space-y-2">
            <Label className="text-xs">Every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={99}
                value={data.interval}
                onChange={(e) => onChange({ interval: parseInt(e.target.value) || 1 })}
                className="h-9 w-20"
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">
                {data.frequency === "daily" && (data.interval === 1 ? "day" : "days")}
                {data.frequency === "weekly" && (data.interval === 1 ? "week" : "weeks")}
                {data.frequency === "monthly" && (data.interval === 1 ? "month" : "months")}
                {data.frequency === "yearly" && (data.interval === 1 ? "year" : "years")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Weekly: Day Selection */}
      {data.frequency === "weekly" && (
        <div className="space-y-2">
          <Label className="text-xs">Repeat on</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day.value}
                type="button"
                variant={data.daysOfWeek.includes(day.value) ? "default" : "outline"}
                size="sm"
                className="h-8 w-10 p-0"
                onClick={() => handleDayToggle(day.value)}
                disabled={disabled}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly: Day of Month */}
      {data.frequency === "monthly" && (
        <div className="space-y-2">
          <Label className="text-xs">Day of Month</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={data.dayOfMonth || ""}
            onChange={(e) => onChange({ dayOfMonth: parseInt(e.target.value) || null })}
            placeholder="e.g., 15"
            className="h-9 w-24"
            disabled={disabled}
          />
        </div>
      )}

      {data.isRecurring && (
        <>
          {/* Reset Behavior */}
          <div className="space-y-2">
            <Label className="text-xs">Completion Behavior</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="reset-original"
                  checked={!data.resetFromCompletion}
                  onChange={() => onChange({ resetFromCompletion: false })}
                  className="h-4 w-4"
                  disabled={disabled}
                />
                <Label htmlFor="reset-original" className="text-sm font-normal cursor-pointer">
                  Reset from original due date
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="reset-completion"
                  checked={data.resetFromCompletion}
                  onChange={() => onChange({ resetFromCompletion: true })}
                  className="h-4 w-4"
                  disabled={disabled}
                />
                <Label htmlFor="reset-completion" className="text-sm font-normal cursor-pointer">
                  Reset from completion date (Google Tasks style)
                </Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.resetFromCompletion
                ? "Next task will be scheduled based on when you complete the current one"
                : "Next task will be scheduled based on the original pattern"}
            </p>
          </div>

          {/* End Condition */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Ends</Label>
              <Select
                value={data.endType}
                onValueChange={(value) => onChange({ endType: value })}
                disabled={disabled}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_END_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {data.endType === "after_occurrences" && (
              <div className="space-y-2">
                <Label className="text-xs">After</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={data.occurrencesLimit || ""}
                    onChange={(e) => onChange({ occurrencesLimit: parseInt(e.target.value) || null })}
                    className="h-9 w-20"
                    disabled={disabled}
                  />
                  <span className="text-sm text-muted-foreground">occurrences</span>
                </div>
              </div>
            )}

            {data.endType === "on_date" && (
              <div className="space-y-2">
                <Label className="text-xs">End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-full justify-start text-left font-normal",
                        !data.endDate && "text-muted-foreground"
                      )}
                      disabled={disabled}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {data.endDate ? format(data.endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={data.endDate}
                      onSelect={(date) => onChange({ endDate: date })}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
