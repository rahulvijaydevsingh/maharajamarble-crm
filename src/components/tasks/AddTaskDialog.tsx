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
import { Loader2, Star } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/hooks/useTasks";
import { useStaffActivityLog } from "@/hooks/useStaffActivityLog";
import { TaskFormFields } from "./form/TaskFormFields";
import {
  TASK_TYPES as FALLBACK_TASK_TYPES,
  KIT_TASK_TYPES as FALLBACK_KIT_TASK_TYPES,
  TASK_PRIORITIES as FALLBACK_TASK_PRIORITIES,
  TASK_TEMPLATES,
} from "@/constants/taskConstants";
import {
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useAuth } from "@/contexts/AuthContext";

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
  bulkMode?: boolean;
  bulkLeadCount?: number;
  onBulkTaskSubmit?: (taskData: any, subtasks: Subtask[]) => void;
  contentClassName?: string;
  overlayClassName?: string;
}

export function AddTaskDialog({ open, onOpenChange, onTaskCreate, prefilledData, bulkMode, bulkLeadCount, onBulkTaskSubmit, contentClassName, overlayClassName }: AddTaskDialogProps) {
  const { toast } = useToast();
  const { addTask } = useTasks();
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { getFieldOptions } = useControlPanelSettings();
  const { defaultRemindersEnabled } = useSystemSettings();
  const { logStaffAction } = useStaffActivityLog();
  const { user, profile, loading: authLoading } = useAuth();

  // Use control panel options, fallback to constants
  const TASK_TYPES = useMemo(() => {
    const cpOptions = getFieldOptions("tasks", "type");
    if (cpOptions.length > 0) {
      return cpOptions.filter(o => !o.value.startsWith("KIT")).map(o => o.value);
    }
    return FALLBACK_TASK_TYPES;
  }, [getFieldOptions]);

  const KIT_TASK_TYPES = useMemo(() => {
    const cpOptions = getFieldOptions("tasks", "type");
    if (cpOptions.length > 0) {
      return cpOptions.filter(o => o.value.startsWith("KIT")).map(o => o.value);
    }
    return FALLBACK_KIT_TASK_TYPES;
  }, [getFieldOptions]);

  const TASK_PRIORITIES = useMemo(() => {
    const cpOptions = getFieldOptions("tasks", "priority");
    if (cpOptions.length > 0) {
      return cpOptions.map(o => ({ value: o.value, label: o.label, color: o.color ? `text-[${o.color}]` : "text-foreground" }));
    }
    return FALLBACK_TASK_PRIORITIES;
  }, [getFieldOptions]);
  
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
    if (!authLoading && staffMembers.length > 0 && !formData.assignedTo) {
      const currentUserMember = staffMembers.find(m => m.id === user?.id);
      const defaultAssignee = currentUserMember?.name || staffMembers[0].name;
      setFormData(prev => ({ ...prev, assignedTo: defaultAssignee }));
    }
  }, [staffMembers, user, authLoading, formData.assignedTo]);

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
        // created_by is set by the addTask hook from the authenticated user's email
      };

      // Bulk mode: return data to parent instead of creating directly
      if (bulkMode && onBulkTaskSubmit) {
        onBulkTaskSubmit(taskData, subtasks);
        onOpenChange(false);
        resetForm();
        return;
      }
      
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

      logStaffAction('create_task', `Created task: ${formData.title}`, 'task');
      
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
      <DialogContent className={cn("sm:max-w-[700px] max-h-[90vh] overflow-y-auto z-[100]", contentClassName)} overlayClassName={overlayClassName} hideOverlay={!!overlayClassName}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bulkMode ? `Create Tasks for ${bulkLeadCount} Leads` : "Add New Task"}
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
            {bulkMode
              ? "A task will be created and linked to each selected lead"
              : "Create a new task and assign it to a team member"}
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
              <SelectContent className="z-[200]">
                {TASK_TEMPLATES.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name} {template.isRecurring && "🔄"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TaskFormFields
            formData={formData}
            onFormDataChange={handleInputChange}
            recurrenceData={recurrenceData}
            onRecurrenceChange={handleRecurrenceChange}
            subtasks={subtasks}
            onAddSubtask={handleAddSubtask}
            onUpdateSubtask={handleUpdateSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            errors={errors}
            staffMembers={staffMembers}
            TASK_TYPES={TASK_TYPES}
            KIT_TASK_TYPES={KIT_TASK_TYPES}
            TASK_PRIORITIES={TASK_PRIORITIES}
            showAdvanced={showAdvanced}
            onShowAdvancedChange={setShowAdvanced}
            selectedEntity={selectedEntity}
            relatedEntityType={relatedEntityType}
            onRelatedEntityChange={(entity, type) => {
              setSelectedEntity(entity);
              setRelatedEntityType(type);
            }}
            hideRelatedEntity={bulkMode}
            staffLoading={staffLoading}
            characterCount={characterCount}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {!bulkMode && (
            <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Add Another
            </Button>
          )}
          <Button onClick={() => handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bulkMode ? `Create for ${bulkLeadCount} Leads` : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
