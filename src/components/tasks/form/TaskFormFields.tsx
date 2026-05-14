import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SubtasksSection } from "./SubtasksSection";
import { RecurrenceSection } from "./RecurrenceSection";
import { RelatedEntitySection } from "./RelatedEntitySection";
import { REMINDER_OPTIONS } from "@/constants/taskConstants";

export interface TaskFormFieldsProps {
  formData: {
    title: string;
    type: string;
    assignedTo: string;
    priority: string;
    dueDate: Date;
    dueTime: string;
    description: string;
    reminder: boolean;
    reminderTime: string;
    isStarred: boolean;
  };
  onFormDataChange: (field: string, value: any) => void;
  recurrenceData: {
    isRecurring: boolean;
    frequency: string;
    interval: number;
    daysOfWeek: string[];
    dayOfMonth: number | null;
    resetFromCompletion: boolean;
    endType: string;
    endDate: Date | undefined;
    occurrencesLimit: number | null;
  };
  onRecurrenceChange: (updates: Partial<TaskFormFieldsProps['recurrenceData']>) => void;
  subtasks: Array<{ id: string; title: string; is_completed: boolean }>;
  onAddSubtask: (title: string) => void;
  onUpdateSubtask: (id: string, updates: any) => void;
  onDeleteSubtask: (id: string) => void;
  errors: Record<string, string>;
  staffMembers: Array<{ id: string; name: string; email?: string }>;
  TASK_TYPES: string[];
  KIT_TASK_TYPES: string[];
  TASK_PRIORITIES: Array<{ value: string; label: string; color: string }>;
  showAdvanced: boolean;
  onShowAdvancedChange: (val: boolean) => void;
  selectedEntity?: {
    id: string; name: string; phone: string;
    type: "lead" | "professional" | "customer";
  } | null;
  relatedEntityType?: string | null;
  onRelatedEntityChange?: (entity: any, type: string | null) => void;
  hideRelatedEntity?: boolean;
  characterCount: number;
}

export function TaskFormFields({
  formData,
  onFormDataChange,
  recurrenceData,
  onRecurrenceChange,
  subtasks,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
  errors,
  staffMembers,
  TASK_TYPES,
  KIT_TASK_TYPES,
  TASK_PRIORITIES,
  showAdvanced,
  onShowAdvancedChange,
  selectedEntity,
  relatedEntityType,
  onRelatedEntityChange,
  hideRelatedEntity = false,
  characterCount,
}: TaskFormFieldsProps) {

  const getActiveZone = (time: string) => {
    if (!time) return null;
    if (time >= "08:00" && time <= "11:59") return "morning";
    if (time >= "12:00" && time <= "16:59") return "afternoon";
    if (time >= "17:00" && time <= "20:00") return "evening";
    return null;
  };

  const activeZone = getActiveZone(formData.dueTime);

  const zoneSlots = {
    morning: ["08:00", "09:00", "10:00", "11:00"],
    afternoon: ["12:00", "13:00", "14:00", "15:00", "16:00"],
    evening: ["17:00", "18:00", "19:00", "20:00"],
  };

  return (
    <div className="space-y-4">
      {/* Task Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Task Title *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => onFormDataChange("title", e.target.value)}
          placeholder="Enter task title"
          maxLength={100}
          className={cn(errors.title && "border-destructive")}
        />
        {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        <p className="text-xs text-muted-foreground">{formData.title.length}/100 characters</p>
      </div>

      {/* Task Type & Priority */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Task Type *</Label>
          <Select value={formData.type} onValueChange={(v) => onFormDataChange("type", v)}>
            <SelectTrigger className={cn(errors.type && "border-destructive")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectGroup>
                <SelectLabel>Standard Tasks</SelectLabel>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>KIT Tasks</SelectLabel>
                {KIT_TASK_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Priority *</Label>
          <Select value={formData.priority} onValueChange={(v) => onFormDataChange("priority", v)}>
            <SelectTrigger className={cn(errors.priority && "border-destructive")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[200]">
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className={p.color}>{p.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assign To */}
      <div className="space-y-2">
        <Label>Assign To *</Label>
        <Select value={formData.assignedTo} onValueChange={(v) => onFormDataChange("assignedTo", v)}>
          <SelectTrigger className={cn(errors.assignedTo && "border-destructive")}>
            <SelectValue placeholder="Select team member" />
          </SelectTrigger>
          <SelectContent className="z-[200]">
            {staffMembers.map((member) => (
              <SelectItem key={member.id} value={member.name}>
                {(member as any)._display || member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Due Date & Improved Time Picker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Due Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !formData.dueDate && "text-muted-foreground",
                  errors.dueDate && "border-destructive"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.dueDate ? format(formData.dueDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[200]" align="start">
              <Calendar
                mode="single"
                selected={formData.dueDate}
                onSelect={(date) => date && onFormDataChange("dueDate", date)}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {errors.dueDate && <p className="text-sm text-destructive">{errors.dueDate}</p>}
        </div>

        <div className="space-y-2">
          <Label>Due Time</Label>
          <div className="space-y-3">
            {/* Zone 1: Preset buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("flex-1 text-xs h-8", activeZone === "morning" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                onClick={() => onFormDataChange("dueTime", "10:00")}
              >
                Morning
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("flex-1 text-xs h-8", activeZone === "afternoon" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                onClick={() => onFormDataChange("dueTime", "14:00")}
              >
                Afternoon
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("flex-1 text-xs h-8", activeZone === "evening" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                onClick={() => onFormDataChange("dueTime", "17:00")}
              >
                Evening
              </Button>
            </div>

            {/* Zone 2: Range-specific slots */}
            {activeZone && (
              <div className="flex flex-wrap gap-1">
                {zoneSlots[activeZone].map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 px-2 text-[10px] rounded-full",
                      formData.dueTime === slot && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                    onClick={() => onFormDataChange("dueTime", slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            )}

            {/* Zone 3: Custom input */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Custom:</span>
              <Input
                type="time"
                value={formData.dueTime}
                onChange={(e) => onFormDataChange("dueTime", e.target.value)}
                className={cn("h-7 w-28 text-xs", errors.dueTime && "border-destructive")}
              />
            </div>
            {errors.dueTime && <p className="text-sm text-destructive">{errors.dueTime}</p>}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => onFormDataChange("description", e.target.value)}
          placeholder="Enter task details and instructions"
          maxLength={500}
          rows={3}
          className={cn(errors.description && "border-destructive")}
        />
        <p className="text-xs text-muted-foreground">{characterCount}/500 characters</p>
      </div>

      {/* Advanced Options */}
      <Collapsible open={showAdvanced} onOpenChange={onShowAdvancedChange}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent" type="button">
            <span className="text-sm font-medium">Advanced Options</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-4">
          {/* Reminder */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reminder"
                checked={formData.reminder}
                onCheckedChange={(checked) => onFormDataChange("reminder", !!checked)}
              />
              <Label htmlFor="reminder" className="text-sm cursor-pointer">Enable Reminder</Label>
            </div>
            {formData.reminder && (
              <Select value={formData.reminderTime} onValueChange={(v) => onFormDataChange("reminderTime", v)}>
                <SelectTrigger className={cn("text-xs h-8 w-40", errors.reminderTime && "border-destructive")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {REMINDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.reminderTime && <p className="text-sm text-destructive">{errors.reminderTime}</p>}
          </div>

          {/* Subtasks */}
          <SubtasksSection
            subtasks={subtasks}
            onAddSubtask={onAddSubtask}
            onUpdateSubtask={onUpdateSubtask}
            onDeleteSubtask={onDeleteSubtask}
          />

          {/* Recurrence */}
          <RecurrenceSection
            data={recurrenceData}
            onChange={onRecurrenceChange}
          />

          {/* Related Entity */}
          {!hideRelatedEntity && onRelatedEntityChange && (
            <RelatedEntitySection
              entityType={relatedEntityType || null}
              selectedEntity={selectedEntity || null}
              onEntityTypeChange={(type) => onRelatedEntityChange(selectedEntity, type)}
              onEntitySelect={(entity) => onRelatedEntityChange(entity, relatedEntityType || null)}
            />
          )}

          {/* isStarred checkbox */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="isStarred"
              checked={formData.isStarred}
              onCheckedChange={(checked) => onFormDataChange("isStarred", !!checked)}
            />
            <Label htmlFor="isStarred" className="text-sm cursor-pointer">Star this task</Label>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
