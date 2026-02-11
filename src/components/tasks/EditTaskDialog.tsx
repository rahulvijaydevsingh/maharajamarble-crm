import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Clock, Star, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/hooks/useTasks";
import { useSubtasks } from "@/hooks/useSubtasks";
import { useLogActivity } from "@/hooks/useActivityLog";
import { SubtasksSection } from "./form/SubtasksSection";
import { RecurrenceSection } from "./form/RecurrenceSection";
import { RelatedEntitySection } from "./form/RelatedEntitySection";
import { SnoozeMenu } from "./form/SnoozeMenu";
import {
  TASK_TYPES,
  KIT_TASK_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  REMINDER_OPTIONS,
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

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskData: any;
  onSave: (updatedData: any) => void;
}

export function EditTaskDialog({ open, onOpenChange, taskData, onSave }: EditTaskDialogProps) {
  const { toast } = useToast();
  const { updateTask, snoozeTask, toggleStar } = useTasks();
  const { subtasks, addSubtask, updateSubtask, deleteSubtask, refetch: refetchSubtasks } = useSubtasks(taskData?.id);
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { logActivity } = useLogActivity();

  const [formData, setFormData] = useState({
    title: "",
    type: "",
    priority: "",
    assignedTo: "",
    status: "",
    dueDate: undefined as Date | undefined,
    dueTime: "",
    description: "",
    reminder: false,
    reminderTime: "",
    isStarred: false,
  });

  // Related entity state (matching AddTaskDialog)
  const [relatedEntityType, setRelatedEntityType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<RelatedEntity | null>(null);
  const [originalEntity, setOriginalEntity] = useState<RelatedEntity | null>(null);

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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (taskData) {
      setFormData({
        title: taskData.title || "",
        type: taskData.type || "",
        priority: taskData.priority || "",
        assignedTo: taskData.assigned_to || taskData.assignedTo || "",
        status: taskData.status || "",
        dueDate: taskData.due_date ? new Date(taskData.due_date) : undefined,
        dueTime: taskData.due_time || "",
        description: taskData.description || "",
        reminder: taskData.reminder || false,
        reminderTime: taskData.reminder_time || "",
        isStarred: taskData.is_starred || false,
      });

      setRecurrenceData({
        isRecurring: taskData.is_recurring || false,
        frequency: taskData.recurrence_frequency || "one-time",
        interval: taskData.recurrence_interval || 1,
        daysOfWeek: taskData.recurrence_days_of_week || [],
        dayOfMonth: taskData.recurrence_day_of_month || null,
        resetFromCompletion: taskData.recurrence_reset_from_completion || false,
        endType: taskData.recurrence_end_type || "never",
        endDate: taskData.recurrence_end_date ? new Date(taskData.recurrence_end_date) : undefined,
        occurrencesLimit: taskData.recurrence_occurrences_limit || null,
      });

      // Set related entity from task data
      if (taskData.related_entity_type && taskData.related_entity_id) {
        const entity: RelatedEntity = {
          id: taskData.related_entity_id,
          name: taskData.lead?.name || taskData.related_entity_name || 'Unknown',
          phone: taskData.lead?.phone || taskData.related_entity_phone || '',
          type: taskData.related_entity_type as "lead" | "professional" | "customer",
        };
        setSelectedEntity(entity);
        setOriginalEntity(entity);
        setRelatedEntityType(taskData.related_entity_type);
      } else if (taskData.lead_id && taskData.lead) {
        const entity: RelatedEntity = {
          id: taskData.lead_id,
          name: taskData.lead.name,
          phone: taskData.lead.phone || '',
          type: 'lead',
        };
        setSelectedEntity(entity);
        setOriginalEntity(entity);
        setRelatedEntityType('lead');
      } else {
        setSelectedEntity(null);
        setOriginalEntity(null);
        setRelatedEntityType(null);
      }

      if (taskData.is_recurring) {
        setShowAdvanced(true);
      }

      refetchSubtasks();
    }
  }, [taskData]);

  const handleRecurrenceChange = (updates: Partial<typeof recurrenceData>) => {
    setRecurrenceData(prev => ({ ...prev, ...updates }));
  };

  const handleAddSubtask = async (title: string) => {
    if (taskData?.id) {
      await addSubtask({ task_id: taskData.id, title, sort_order: subtasks.length });
    }
  };

  const handleUpdateSubtask = async (id: string, updates: any) => {
    await updateSubtask(id, updates);
  };

  const handleDeleteSubtask = async (id: string) => {
    await deleteSubtask(id);
  };

  const handleSnooze = async (hours: number) => {
    if (taskData?.id) {
      await snoozeTask(taskData.id, hours);
      
      // Log snooze to activity log if task is linked to a lead or customer
      const leadId = taskData.lead_id || taskData.leadId;
      const customerId = taskData.customer_id || taskData.customerId;
      const relatedEntityType = taskData.related_entity_type;
      const relatedEntityId = taskData.related_entity_id;

      let logLeadId: string | undefined;
      let logCustomerId: string | undefined;

      if (leadId) {
        logLeadId = leadId;
      } else if (relatedEntityType === 'lead' && relatedEntityId) {
        logLeadId = relatedEntityId;
      } else if (customerId) {
        logCustomerId = customerId;
      } else if (relatedEntityType === 'customer' && relatedEntityId) {
        logCustomerId = relatedEntityId;
      }

      if (logLeadId || logCustomerId) {
        const snoozeLabel = hours === 1 ? "1 hour" : hours === 3 ? "3 hours" : hours === 24 ? "Tomorrow" : hours === 168 ? "Next week" : `${hours} hours`;
        await logActivity({
          lead_id: logLeadId,
          customer_id: logCustomerId,
          activity_type: 'task_snoozed',
          activity_category: 'task',
          title: `Task Snoozed: ${formData.title}`,
          description: `Task snoozed for ${snoozeLabel}`,
          metadata: {
            task_id: taskData.id,
            snooze_hours: hours,
          },
          related_entity_type: 'task',
          related_entity_id: taskData.id,
        });
      }
      
      onOpenChange(false);
    }
  };

  const handleToggleStar = async () => {
    if (taskData?.id) {
      await toggleStar(taskData.id);
      setFormData(prev => ({ ...prev, isStarred: !prev.isStarred }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedData = {
        title: formData.title,
        type: formData.type,
        priority: formData.priority,
        assigned_to: formData.assignedTo,
        status: formData.status,
        due_date: formData.dueDate ? format(formData.dueDate, 'yyyy-MM-dd') : null,
        due_time: formData.dueTime || null,
        description: formData.description || null,
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
        // Related entity fields
        lead_id: selectedEntity?.type === "lead" ? selectedEntity.id : null,
        related_entity_type: selectedEntity?.type || null,
        related_entity_id: selectedEntity?.id || null,
      };

      await updateTask(taskData.id, updatedData);

      // Log to activity log - determine entities
      // Use the NEW selected entity for logging if changed, otherwise use the original
      let logLeadId: string | undefined;
      let logCustomerId: string | undefined;

      // If the entity changed, we need to log to both old and new entities
      const entityChanged = 
        originalEntity?.id !== selectedEntity?.id || 
        originalEntity?.type !== selectedEntity?.type;

      // Determine primary entity for logging (use new entity if changed)
      if (selectedEntity?.type === 'lead') {
        logLeadId = selectedEntity.id;
      } else if (selectedEntity?.type === 'customer') {
        logCustomerId = selectedEntity.id;
      } else if (originalEntity?.type === 'lead') {
        logLeadId = originalEntity.id;
      } else if (originalEntity?.type === 'customer') {
        logCustomerId = originalEntity.id;
      }

      // Track what changed - all fields
      const changes: string[] = [];
      
      // Track Related To change
      if (entityChanged) {
        const oldRelated = originalEntity ? `${originalEntity.type.charAt(0).toUpperCase() + originalEntity.type.slice(1)}: ${originalEntity.name}` : 'None';
        const newRelated = selectedEntity ? `${selectedEntity.type.charAt(0).toUpperCase() + selectedEntity.type.slice(1)}: ${selectedEntity.name}` : 'None';
        changes.push(`Related To: "${oldRelated}" → "${newRelated}"`);
      }
      
      if (taskData.title !== formData.title) {
        changes.push(`Title: "${taskData.title}" → "${formData.title}"`);
      }
      if (taskData.type !== formData.type) {
        changes.push(`Type: "${taskData.type || 'Not set'}" → "${formData.type}"`);
      }
      if (taskData.status !== formData.status) {
        changes.push(`Status: "${taskData.status}" → "${formData.status}"`);
      }
      if (taskData.priority !== formData.priority) {
        changes.push(`Priority: "${taskData.priority}" → "${formData.priority}"`);
      }
      if ((taskData.assigned_to || taskData.assignedTo) !== formData.assignedTo) {
        changes.push(`Assigned To: "${taskData.assigned_to || taskData.assignedTo}" → "${formData.assignedTo}"`);
      }
      
      // Due Date comparison
      const oldDueDate = taskData.due_date ? format(new Date(taskData.due_date), 'yyyy-MM-dd') : null;
      const newDueDate = formData.dueDate ? format(formData.dueDate, 'yyyy-MM-dd') : null;
      if (oldDueDate !== newDueDate) {
        changes.push(`Due Date: "${oldDueDate || 'Not set'}" → "${newDueDate || 'Not set'}"`);
      }
      
      // Due Time comparison
      const oldDueTime = taskData.due_time || null;
      const newDueTime = formData.dueTime || null;
      if (oldDueTime !== newDueTime) {
        changes.push(`Due Time: "${oldDueTime || 'Not set'}" → "${newDueTime || 'Not set'}"`);
      }
      
      // Description comparison
      const oldDescription = taskData.description || '';
      const newDescription = formData.description || '';
      if (oldDescription !== newDescription) {
        const oldDescShort = oldDescription ? (oldDescription.length > 30 ? oldDescription.substring(0, 30) + '...' : oldDescription) : 'Not set';
        const newDescShort = newDescription ? (newDescription.length > 30 ? newDescription.substring(0, 30) + '...' : newDescription) : 'Not set';
        changes.push(`Description: "${oldDescShort}" → "${newDescShort}"`);
      }
      
      // Reminder comparison
      const oldReminder = taskData.reminder || false;
      const newReminder = formData.reminder || false;
      if (oldReminder !== newReminder) {
        changes.push(`Reminder: "${oldReminder ? 'Enabled' : 'Disabled'}" → "${newReminder ? 'Enabled' : 'Disabled'}"`);
      }
      
      // Starred comparison
      const oldStarred = taskData.is_starred || false;
      const newStarred = formData.isStarred || false;
      if (oldStarred !== newStarred) {
        changes.push(`Starred: "${oldStarred ? 'Yes' : 'No'}" → "${newStarred ? 'Yes' : 'No'}"`);
      }

      // Log activity if there are changes
      if (changes.length > 0) {
        // If entity changed, log to BOTH the old and new entities
        if (entityChanged && originalEntity && selectedEntity) {
          // Log to the OLD entity (task was removed from here)
          if (originalEntity.type === 'lead') {
            await logActivity({
              lead_id: originalEntity.id,
              activity_type: 'task_updated',
              activity_category: 'task',
              title: `Task Reassigned: ${formData.title}`,
              description: `Task moved to ${selectedEntity.type.charAt(0).toUpperCase() + selectedEntity.type.slice(1)}: ${selectedEntity.name}\n\nChanges:\n${changes.join('\n')}`,
              metadata: {
                task_id: taskData.id,
                changes,
                moved_to: { type: selectedEntity.type, id: selectedEntity.id, name: selectedEntity.name },
              },
              related_entity_type: 'task',
              related_entity_id: taskData.id,
            });
          } else if (originalEntity.type === 'customer') {
            await logActivity({
              customer_id: originalEntity.id,
              activity_type: 'task_updated',
              activity_category: 'task',
              title: `Task Reassigned: ${formData.title}`,
              description: `Task moved to ${selectedEntity.type.charAt(0).toUpperCase() + selectedEntity.type.slice(1)}: ${selectedEntity.name}\n\nChanges:\n${changes.join('\n')}`,
              metadata: {
                task_id: taskData.id,
                changes,
                moved_to: { type: selectedEntity.type, id: selectedEntity.id, name: selectedEntity.name },
              },
              related_entity_type: 'task',
              related_entity_id: taskData.id,
            });
          }

          // Log to the NEW entity (task was added here)
          if (selectedEntity.type === 'lead') {
            await logActivity({
              lead_id: selectedEntity.id,
              activity_type: 'task_updated',
              activity_category: 'task',
              title: `Task Assigned: ${formData.title}`,
              description: `Task moved from ${originalEntity.type.charAt(0).toUpperCase() + originalEntity.type.slice(1)}: ${originalEntity.name}\n\nChanges:\n${changes.join('\n')}`,
              metadata: {
                task_id: taskData.id,
                changes,
                moved_from: { type: originalEntity.type, id: originalEntity.id, name: originalEntity.name },
              },
              related_entity_type: 'task',
              related_entity_id: taskData.id,
            });
          } else if (selectedEntity.type === 'customer') {
            await logActivity({
              customer_id: selectedEntity.id,
              activity_type: 'task_updated',
              activity_category: 'task',
              title: `Task Assigned: ${formData.title}`,
              description: `Task moved from ${originalEntity.type.charAt(0).toUpperCase() + originalEntity.type.slice(1)}: ${originalEntity.name}\n\nChanges:\n${changes.join('\n')}`,
              metadata: {
                task_id: taskData.id,
                changes,
                moved_from: { type: originalEntity.type, id: originalEntity.id, name: originalEntity.name },
              },
              related_entity_type: 'task',
              related_entity_id: taskData.id,
            });
          }
        } else if (logLeadId || logCustomerId) {
          // No entity change, log to the current entity
          await logActivity({
            lead_id: logLeadId,
            customer_id: logCustomerId,
            activity_type: 'task_updated',
            activity_category: 'task',
            title: `Task Updated: ${formData.title}`,
            description: `Updated ${changes.length} field(s):\n${changes.join('\n')}`,
            metadata: {
              task_id: taskData.id,
              changes,
            },
            related_entity_type: 'task',
            related_entity_id: taskData.id,
          });
        }
      }
      
      toast({
        title: "Task Updated",
        description: "Your changes have been saved.",
      });

      onSave({ ...taskData, ...updatedData });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              Edit Task
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", formData.isStarred && "text-yellow-500")}
                onClick={handleToggleStar}
              >
                <Star className={cn("h-5 w-5", formData.isStarred && "fill-current")} />
              </Button>
            </span>
            <div className="ml-8">
              <SnoozeMenu onSnooze={handleSnooze} />
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>Task Title *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter task title"
              maxLength={100}
            />
          </div>

          {/* Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Task Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
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
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={p.color}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={formData.assignedTo} onValueChange={(v) => setFormData({ ...formData, assignedTo: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading..." : "Select assignee"} />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {staffMembers.map((member) => (
                    <SelectItem key={member.id} value={member.email || member.id}>
                      {(member as any)._display || member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Related Entity - matching AddTaskDialog */}
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
                      !formData.dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dueDate ? format(formData.dueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[80]" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate}
                    onSelect={(date) => setFormData({ ...formData, dueDate: date })}
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
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reminder</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.reminder}
                    onCheckedChange={(checked) => setFormData({ ...formData, reminder: !!checked })}
                  />
                  <span className="text-sm">Enable</span>
                </div>
                {formData.reminder && (
                  <Select value={formData.reminderTime} onValueChange={(v) => setFormData({ ...formData, reminderTime: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
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
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter task details"
              maxLength={500}
              rows={3}
            />
            <div className="text-xs text-muted-foreground text-right">
              {formData.description.length}/500 characters
            </div>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <span className="text-sm font-medium">Advanced Options</span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <RecurrenceSection
                data={recurrenceData}
                onChange={handleRecurrenceChange}
              />

              <SubtasksSection
                subtasks={subtasks.map(s => ({ id: s.id, title: s.title, is_completed: s.is_completed }))}
                onAddSubtask={handleAddSubtask}
                onUpdateSubtask={handleUpdateSubtask}
                onDeleteSubtask={handleDeleteSubtask}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
