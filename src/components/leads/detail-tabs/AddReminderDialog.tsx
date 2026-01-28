import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { format, addHours, addDays, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RECURRENCE_FREQUENCIES,
  DAYS_OF_WEEK,
  RECURRENCE_END_TYPES,
} from "@/constants/taskConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";

interface AddReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    description: string;
    reminder_datetime: string;
    is_recurring: boolean;
    recurrence_pattern: string | null;
    recurrence_end_date: string | null;
    assigned_to: string;
  }) => Promise<void>;
  entityName: string;
}

export function AddReminderDialog({
  open,
  onOpenChange,
  onSave,
  entityName,
}: AddReminderDialogProps) {
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>(addDays(new Date(), 1));
  const [time, setTime] = useState("10:00");
  const [assignedTo, setAssignedTo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default assignee when staff loads
  React.useEffect(() => {
    if (staffMembers.length > 0 && !assignedTo) {
      setAssignedTo(staffMembers[0].name);
    }
  }, [staffMembers, assignedTo]);

  // Recurrence state - matching task form
  const [frequency, setFrequency] = useState("one-time");
  const [interval, setInterval] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(["mon"]);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(null);
  const [endType, setEndType] = useState("never");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [occurrencesLimit, setOccurrencesLimit] = useState<number | null>(null);

  const isRecurring = frequency !== "one-time";

  const handleDayToggle = (day: string) => {
    setDaysOfWeek(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const reminderDate = setMinutes(setHours(date, hours), minutes);

      // Build recurrence pattern string
      let recurrencePattern: string | null = null;
      if (isRecurring) {
        const parts = [frequency, `interval:${interval}`];
        if (frequency === "weekly" && daysOfWeek.length > 0) {
          parts.push(`days:${daysOfWeek.join(",")}`);
        }
        if (frequency === "monthly" && dayOfMonth) {
          parts.push(`dayOfMonth:${dayOfMonth}`);
        }
        if (endType === "after_occurrences" && occurrencesLimit) {
          parts.push(`limit:${occurrencesLimit}`);
        }
        recurrencePattern = parts.join(";");
      }

      await onSave({
        title,
        description,
        reminder_datetime: reminderDate.toISOString(),
        is_recurring: isRecurring,
        recurrence_pattern: recurrencePattern,
        recurrence_end_date: endType === "on_date" && endDate ? endDate.toISOString() : null,
        assigned_to: assignedTo,
      });

      // Reset form
      setTitle("");
      setDescription("");
      setDate(addDays(new Date(), 1));
      setTime("10:00");
      setFrequency("one-time");
      setInterval(1);
      setDaysOfWeek(["mon"]);
      setDayOfMonth(null);
      setEndType("never");
      setEndDate(undefined);
      setOccurrencesLimit(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickDateOptions = [
    { label: "In 1 hour", getValue: () => addHours(new Date(), 1) },
    { label: "Tomorrow 10 AM", getValue: () => setHours(setMinutes(addDays(new Date(), 1), 0), 10) },
    { label: "In 3 days", getValue: () => setHours(setMinutes(addDays(new Date(), 3), 0), 10) },
    { label: "Next week", getValue: () => setHours(setMinutes(addDays(new Date(), 7), 0), 10) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Reminder</DialogTitle>
            <DialogDescription>
              Set a reminder for {entityName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Follow up on quotation"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
              />
            </div>

            {/* Quick Date Options */}
            <div className="space-y-2">
              <Label>Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                {quickDateOptions.map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDate = option.getValue();
                      setDate(newDate);
                      setTime(format(newDate, "HH:mm"));
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      disabled={(d) => d < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Time *</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Assigned To */}
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading..." : "Select team member"} />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map((member) => (
                    <SelectItem key={member.id} value={member.name}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recurrence Settings - Detailed like task form */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Recurrence Settings</span>
              </div>

              {/* Frequency Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
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

                {isRecurring && (
                  <div className="space-y-2">
                    <Label className="text-xs">Every</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={interval}
                        onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                        className="h-9 w-20"
                      />
                      <span className="text-sm text-muted-foreground">
                        {frequency === "daily" && (interval === 1 ? "day" : "days")}
                        {frequency === "weekly" && (interval === 1 ? "week" : "weeks")}
                        {frequency === "monthly" && (interval === 1 ? "month" : "months")}
                        {frequency === "yearly" && (interval === 1 ? "year" : "years")}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Weekly: Day Selection */}
              {frequency === "weekly" && (
                <div className="space-y-2">
                  <Label className="text-xs">Repeat on</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-10 p-0"
                        onClick={() => handleDayToggle(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly: Day of Month */}
              {frequency === "monthly" && (
                <div className="space-y-2">
                  <Label className="text-xs">Day of Month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth || ""}
                    onChange={(e) => setDayOfMonth(parseInt(e.target.value) || null)}
                    placeholder="e.g., 15"
                    className="h-9 w-24"
                  />
                </div>
              )}

              {isRecurring && (
                <>
                  {/* End Condition */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Ends</Label>
                      <Select value={endType} onValueChange={setEndType}>
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

                    {endType === "after_occurrences" && (
                      <div className="space-y-2">
                        <Label className="text-xs">After</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            value={occurrencesLimit || ""}
                            onChange={(e) => setOccurrencesLimit(parseInt(e.target.value) || null)}
                            className="h-9 w-20"
                          />
                          <span className="text-sm text-muted-foreground">occurrences</span>
                        </div>
                      </div>
                    )}

                    {endType === "on_date" && (
                      <div className="space-y-2">
                        <Label className="text-xs">End Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "h-9 w-full justify-start text-left font-normal",
                                !endDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {endDate ? format(endDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              disabled={(d) => d < new Date()}
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Reminder"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
