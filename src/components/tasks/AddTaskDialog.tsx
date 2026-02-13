import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { CalendarIcon, Clock, Loader2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/hooks/useTasks";
import { SubtasksSection } from "./form/SubtasksSection";
import { RecurrenceSection } from "./form/RecurrenceSection";
import { RelatedEntitySection } from "./form/RelatedEntitySection";
import {
  TASK_TYPES,
  KIT_TASK_TYPES,
  TASK_PRIORITIES,
  REMINDER_OPTIONS,
  TASK_TEMPLATES,
} from "@/constants/taskConstants";
import {
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useActiveStaff } from "@/hooks/useActiveStaff";

interface RelatedEntity {
  id: string;
  name: string;
  phone: string;
  type: "lead" | "professional" | "customer";
}

interface Subtask {
  id: string;
  title: string;
  is_completed: boolean;
}

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreate: (taskData: any) => void;
  prefilledData?: {
    relatedTo?: RelatedEntity;
  };
}

export function AddTaskDialog({ open, onOpenChange, onTaskCreate, prefilledData }: AddTaskDialogProps) {
  const { toast } = useToast();
  const { addTask } = useTasks();
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  
  const [formData, setFormData] = useState({
    title: "",
    type: "Follow-up Call",
    assignedTo: "",
    priority: "Medium",
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    dueTime: "10:00",
    description: "",
    reminder: false,
    reminderTime: "30",
    isStarred: false,
  });

  // Set default assignee when staff loads
  useEffect(() => {
    if (staffMembers.length > 0 && !formData.assignedTo) {
      setFormData(prev => ({ ...prev, assignedTo: staffMembers[0].email || staffMembers[0].id }));
    }
  }, [staffMembers]);

  const [relatedEntityType, setRelatedEntityType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<RelatedEntity | null>(null);
  
  const [recurrenceData, setRecurrenceData] = useState({
    isRecurring: false,
    frequency: "one-time",
    interval: 1,
    daysOfWeek: [] as string[],
    dayOfMonth: null as number | null,
    resetFromCompletion: false,
    endType: "never",
    endDate: undefined as Date | undefined,
    occurrencesLimit: null as number | null,
  });

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [characterCount, setCharacterCount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (prefilledData?.relatedTo) {
        setSelectedEntity(prefilledData.relatedTo);
        setRelatedEntityType(prefilledData.relatedTo.type);
      }
    } else {
      resetForm();
    }
  }, [open, prefilledData]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
    if (field === "description") {
      setCharacterCount(value.length);
    }
  };

  const handleRecurrenceChange = (updates: Partial<typeof recurrenceData>) => {
    setRecurrenceData(prev => ({ ...prev, ...updates }));
  };

  const handleAddSubtask = (title: string) => {
    setSubtasks(prev => [...prev, { id: crypto.randomUUID(), title, is_completed: false }]);
  };

  const handleUpdateSubtask = (id: string, updates: Partial<Subtask>) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== id));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      newErrors.title = "Task title is required";
    } else if (formData.title.trim().length < 5) {
      newErrors.title = "Task title must be at least 5 characters";
    } else if (formData.title.length > 100) {
      newErrors.title = "Task title cannot exceed 100 characters";
    }
    
    if (!formData.type) newErrors.type = "Task type is required";
    if (!formData.assignedTo) newErrors.assignedTo = "Assignee is required";
    if (!formData.priority) newErrors.priority = "Priority is required";
    
    if (formData.dueDate < new Date(new Date().setHours(0, 0, 0, 0))) {
      newErrors.dueDate = "Due date cannot be in the past";
    }
    
    if (formData.description && formData.description.length > 500) {
      newErrors.description = "Description cannot exceed 500 characters";
    }
    
    if (formData.reminder && !formData.dueTime) {
      newErrors.reminderTime = "Due time is required when reminder is set";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTemplateSelect = (templateName: string) => {
    const template = TASK_TEMPLATES.find(t => t.name === templateName);
    if (template) {
      setFormData(prev => ({
        ...prev,
        title: template.title,
        type: template.type,
        description: template.description,
      }));
      setCharacterCount(template.description.length);
      
      if (template.isRecurring && template.recurrenceFrequency) {
        setRecurrenceData(prev => ({
          ...prev,
          isRecurring: true,
          frequency: template.recurrenceFrequency!,
        }));
        setShowAdvanced(true);
      }
    }
  };

  const handleSubmit = async (saveAndAddAnother: boolean = false) => {
    if (!validateForm()) return;
    
    setSaving(true);
    
    try {
      const taskData = {
        title: formData.title.trim(),
        type: formData.type,
        priority: formData.priority,
        assigned_to: formData.assignedTo,
        lead_id: selectedEntity?.type === "lead" ? selectedEntity.id : null,
        related_entity_type: selectedEntity?.type || null,
        related_entity_id: selectedEntity?.id || null,
        due_date: format(formData.dueDate, 'yyyy-MM-dd'),
        due_time: formData.dueTime || null,
        status: 'Pending',
        description: formData.description.trim() || null,
        reminder: formData.reminder,
        reminder_time: formData.reminder ? formData.reminderTime : null,
        is_starred: formData.isStarred,
        is_recurring: recurrenceData.isRecurring,
        recurrence_frequency: recurrenceData.isRecurring ? recurrenceData.frequency : null,
        recurrence_interval: recurrenceData.interval,
        recurrence_days_of_week: recurrenceData.daysOfWeek.length > 0 ? recurrenceData.daysOfWeek : null,
        recurrence_day_of_month: recurrenceData.dayOfMonth,
        recurrence_reset_from_completion: recurrenceData.resetFromCompletion,
        recurrence_end_type: recurrenceData.endType,
        recurrence_end_date: recurrenceData.endDate ? format(recurrenceData.endDate, 'yyyy-MM-dd') : null,
        recurrence_occurrences_limit: recurrenceData.occurrencesLimit,
        created_by: "Current User",
      };
      
      const createdTask = await addTask(taskData);
      
      // Create subtasks if any
      if (subtasks.length > 0 && createdTask) {
        const { supabase } = await import("@/integrations/supabase/client");
        for (let i = 0; i < subtasks.length; i++) {
          await supabase.from("task_subtasks").insert({
            task_id: createdTask.id,
            title: subtasks[i].title,
            sort_order: i,
          });
        }
      }
      
      onTaskCreate(taskData);
      
      toast({
        title: "Task Created Successfully",
        description: `Task "${formData.title}" has been assigned to ${formData.assignedTo}.`,
      });
      
      if (saveAndAddAnother) {
        setFormData(prev => ({
          ...prev,
          title: "",
          description: "",
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isStarred: false,
        }));
        setSubtasks([]);
        setCharacterCount(0);
        setErrors({});
      } else {
        onOpenChange(false);
        resetForm();
      }
    } catch (error) {
      console.error("Failed to create task:", error);
      toast({
        title: "Error",
        description: "Failed to create task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      type: "Follow-up Call",
      assignedTo: "",
      priority: "Medium",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dueTime: "10:00",
      description: "",
      reminder: false,
      reminderTime: "30",
      isStarred: false,
    });
    setRelatedEntityType(null);
    setSelectedEntity(null);
    setRecurrenceData({
      isRecurring: false,
      frequency: "one-time",
      interval: 1,
      daysOfWeek: [],
      dayOfMonth: null,
      resetFromCompletion: false,
      endType: "never",
      endDate: undefined,
      occurrencesLimit: null,
    });
    setSubtasks([]);
    setShowAdvanced(false);
    setCharacterCount(0);
    setErrors({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto z-[100]" hideOverlay>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Add New Task
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 w-8 p-0", formData.isStarred && "text-yellow-500")}
              onClick={() => handleInputChange("isStarred", !formData.isStarred)}
            >
              <Star className={cn("h-5 w-5", formData.isStarred && "fill-current")} />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Create a new task and assign it to a team member
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Templates */}
          <div className="space-y-2">
            <Label>Quick Templates (Optional)</Label>
            <Select onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template to auto-fill" />
              </SelectTrigger>
              <SelectContent>
                {TASK_TEMPLATES.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name} {template.isRecurring && "🔄"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Enter task title"
              maxLength={100}
              className={errors.title ? "border-destructive" : ""}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
            <p className="text-xs text-muted-foreground">{formData.title.length}/100 characters</p>
          </div>

          {/* Task Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Task Type *</Label>
              <Select value={formData.type} onValueChange={(v) => handleInputChange("type", v)}>
                <SelectTrigger className={errors.type ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <Select value={formData.priority} onValueChange={(v) => handleInputChange("priority", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <Select value={formData.assignedTo} onValueChange={(v) => handleInputChange("assignedTo", v)}>
              <SelectTrigger>
                <SelectValue placeholder={staffLoading ? "Loading..." : "Select team member"} />
              </SelectTrigger>
              <SelectContent>
                {staffMembers.map((member) => (
                  <SelectItem key={member.id} value={member.email || member.id}>
                    {(member as any)._display || member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Related Entity */}
          <RelatedEntitySection
            entityType={relatedEntityType}
            selectedEntity={selectedEntity}
            onEntityTypeChange={setRelatedEntityType}
            onEntitySelect={setSelectedEntity}
          />

          {/* Due Date, Time & Reminder */}
          <div className="grid grid-cols-3 gap-4">
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
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate}
                    onSelect={(date) => date && handleInputChange("dueDate", date)}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Due Time</Label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => handleInputChange("dueTime", e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reminder</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reminder"
                    checked={formData.reminder}
                    onCheckedChange={(checked) => handleInputChange("reminder", checked)}
                  />
                  <Label htmlFor="reminder" className="text-sm">Enable</Label>
                </div>
                {formData.reminder && (
                  <Select value={formData.reminderTime} onValueChange={(v) => handleInputChange("reminderTime", v)}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Enter task details and instructions"
              maxLength={500}
              rows={3}
              className={errors.description ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">{characterCount}/500 characters</p>
          </div>

          {/* Advanced Options Collapsible */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <span className="text-sm font-medium">Advanced Options</span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {/* Recurrence */}
              <RecurrenceSection
                data={recurrenceData}
                onChange={handleRecurrenceChange}
              />

              {/* Subtasks */}
              <SubtasksSection
                subtasks={subtasks}
                onAddSubtask={handleAddSubtask}
                onUpdateSubtask={handleUpdateSubtask}
                onDeleteSubtask={handleDeleteSubtask}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Add Another
          </Button>
          <Button onClick={() => handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
