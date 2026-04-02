import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTaskCompletionTemplates } from "@/hooks/useTaskCompletionTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logToStaffActivity } from "@/lib/staffActivityLogger";
import type { Task, TaskInsert } from "@/hooks/useTasks";

type NextActionType = "follow_up" | "reschedule" | "convert_to_deal";

const OUTCOME_OPTIONS = [
  { value: "Successful", kind: "success" as const },
  { value: "No Answer", kind: "unsuccessful" as const },
  { value: "Call Back Later", kind: "unsuccessful" as const },
  { value: "Not Interested", kind: "unsuccessful" as const },
  { value: "Wrong Number", kind: "unsuccessful" as const },
  { value: "Rescheduled by Client", kind: "unsuccessful" as const },
];

function outcomeKind(outcome: string | null) {
  return OUTCOME_OPTIONS.find((o) => o.value === outcome)?.kind ?? null;
}

export interface TaskCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  updateTask: (id: string, updates: any) => Promise<any>;
  addTask: (task: TaskInsert) => Promise<any>;
}

export function TaskCompletionDialog({
  open,
  onOpenChange,
  task,
  updateTask,
  addTask,
}: TaskCompletionDialogProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { templates, hasTemplates, loading: templatesLoading } = useTaskCompletionTemplates(task?.type || null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const [outcome, setOutcome] = useState<string>("");
  const [nextAction, setNextAction] = useState<NextActionType | "">("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [closeTask, setCloseTask] = useState(false);

  const [nextDate, setNextDate] = useState<Date | undefined>(undefined);
  const [nextTime, setNextTime] = useState<string>("10:00");

  // Reminder fields for follow-up
  const [reminderOffsetHours, setReminderOffsetHours] = useState<string>("");
  const [customReminderAt, setCustomReminderAt] = useState<string>("");

  const [rescheduleReason, setRescheduleReason] = useState<string>("");

  const [errors, setErrors] = useState<{
    outcome?: string;
    nextAction?: string;
    notes?: string;
    nextDate?: string;
    nextTime?: string;
    rescheduleReason?: string;
  }>({});

  useEffect(() => {
    if (!open) return;
    setSelectedTemplateId(null);
    setOutcome(task?.completion_outcome || "");
    setNotes(task?.completion_notes || "");
    setNextAction((task?.next_action_type as NextActionType) || "");
    setNextDate(undefined);
    setNextTime("10:00");
    setCloseTask(false);
    setReminderOffsetHours("");
    setCustomReminderAt("");
    setRescheduleReason("");
    setErrors({});
  }, [open, task?.id]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.default_outcome) setOutcome(selectedTemplate.default_outcome);
    if (selectedTemplate.template_notes) setNotes(selectedTemplate.template_notes);
    if (selectedTemplate.default_next_action_type) setNextAction(selectedTemplate.default_next_action_type as NextActionType);
  }, [selectedTemplate]);

  const isUnsuccessful = outcomeKind(outcome) === "unsuccessful";
  const minNotes = 50;

  const nextActionOptions = useMemo(() => {
    return [
      { value: "follow_up" as NextActionType, label: "Create Follow-up" },
      { value: "reschedule" as NextActionType, label: "Reschedule" },
      { value: "convert_to_deal" as NextActionType, label: "Convert to Deal", disabled: isUnsuccessful },
    ];
  }, [isUnsuccessful]);

  const nextDateTime = useMemo(() => {
    if (!nextDate) return null;
    const [hStr, mStr] = (nextTime || "00:00").split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(nextDate);
    d.setHours(h, m, 0, 0);
    return d;
  }, [nextDate, nextTime]);

  const isNextTimeToday = useMemo(() => {
    if (!nextDate) return false;
    const now = new Date();
    return nextDate.getFullYear() === now.getFullYear() && nextDate.getMonth() === now.getMonth() && nextDate.getDate() === now.getDate();
  }, [nextDate]);

  const minTimeForToday = useMemo(() => {
    if (!isNextTimeToday) return undefined;
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    return format(d, "HH:mm");
  }, [isNextTimeToday]);

  const timeToMinutes = (t: string) => {
    const [hStr, mStr] = (t || "").split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  useEffect(() => {
    if (!minTimeForToday) return;
    const cur = timeToMinutes(nextTime);
    const min = timeToMinutes(minTimeForToday);
    if (cur === null || min === null) return;
    if (cur < min) setNextTime(minTimeForToday);
  }, [minTimeForToday]);

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!task) return { valid: false, nextErrors: { notes: "No task selected" } };

    if (!outcome) nextErrors.outcome = "Outcome is required";
    if ((notes || "").trim().length < minNotes) nextErrors.notes = `Notes must be at least ${minNotes} characters`;

    // Next action required only when NOT closing the task
    if (!closeTask && !nextAction) nextErrors.nextAction = "Next action is required when task stays open";

    if (nextAction === "follow_up" || nextAction === "reschedule") {
      if (!nextDate) nextErrors.nextDate = "Please pick the next date";
      if (!nextTime) nextErrors.nextTime = "Please pick the next time";
      if (nextDate && !nextDateTime) nextErrors.nextTime = "Invalid time";
      if (nextDate && nextDateTime && nextDateTime.getTime() <= Date.now()) {
        nextErrors.nextTime = "Next schedule must be in the future";
      }
    }

    if (nextAction === "reschedule" && !rescheduleReason.trim()) {
      nextErrors.rescheduleReason = "Reschedule reason is required";
    }

    if (isUnsuccessful && nextAction === "convert_to_deal") {
      nextErrors.nextAction = "Unsuccessful outcomes require Follow-up or Reschedule";
    }

    setErrors(nextErrors);
    return { valid: Object.keys(nextErrors).length === 0 };
  };

  /** Insert into task_activity_log */
  const logTaskActivity = async (taskId: string, eventType: string, metadata: Record<string, any>) => {
    try {
      await (supabase.from("task_activity_log") as any).insert({
        task_id: taskId,
        event_type: eventType,
        user_id: user?.id || null,
        user_name: user?.email?.split("@")[0] || "System",
        metadata,
        notes: null,
      });
    } catch (e) {
      console.warn("Failed to log task activity:", e);
    }
  };

  /** Insert into lead activity_log */
  const logLeadActivity = async (leadId: string, title: string, metadata: Record<string, any>, taskId: string) => {
    try {
      await supabase.from("activity_log").insert({
        lead_id: leadId,
        activity_type: "task_outcome_recorded",
        activity_category: "task",
        user_id: user?.id || null,
        user_name: profile?.full_name || user?.email?.split("@")[0] || "System",
        title,
        metadata: metadata as any,
        is_manual: false,
        is_editable: false,
        related_entity_type: "task",
        related_entity_id: taskId,
      });
    } catch (e) {
      console.warn("Failed to log lead activity:", e);
    }
  };

  const handleSubmit = async () => {
    const v = validate();
    if (!v.valid || !task) return;

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const attemptCount = (task.attempt_count ?? 0) + 1;
      const completion_status = outcomeKind(outcome) === "success" ? "success" : "unsuccessful";

      const next_action_payload =
        nextAction === "convert_to_deal"
          ? { source: "task_completion" }
          : nextDate
            ? { due_date: format(nextDate, "yyyy-MM-dd"), due_time: nextTime || null }
            : null;

      // Build update payload
      const taskUpdate: Record<string, any> = {
        completion_outcome: outcome,
        completion_notes: notes.trim(),
        completion_status,
        attempt_count: attemptCount,
        last_attempt_at: nowIso,
        next_action_type: nextAction || null,
        next_action_payload,
      };

      if (closeTask) {
        taskUpdate.status = "Completed";
        taskUpdate.closed_at = nowIso;
        taskUpdate.closed_by = user?.id || null;
        taskUpdate.deal_ready = nextAction === "convert_to_deal" ? true : task.deal_ready ?? false;
        taskUpdate.deal_ready_at = nextAction === "convert_to_deal" ? nowIso : task.deal_ready_at ?? null;
      } else {
        // Keep current status, only update outcome fields
        taskUpdate.deal_ready = nextAction === "convert_to_deal" ? true : task.deal_ready ?? false;
        taskUpdate.deal_ready_at = nextAction === "convert_to_deal" ? nowIso : task.deal_ready_at ?? null;
      }

      // 1) Update the task
      await updateTask(task.id, taskUpdate);

      // 2) Log outcome_recorded to task_activity_log
      await logTaskActivity(task.id, "outcome_recorded", {
        outcome,
        completion_status,
        notes: notes.trim(),
        attempt_count: attemptCount,
      });

      // 3) If closing, log closed event
      if (closeTask) {
        await logTaskActivity(task.id, "closed", {
          closed_by: user?.id,
          closed_at: nowIso,
          outcome,
        });
      }

      // 4a) Reschedule: update SAME task's due date
      if (nextAction === "reschedule") {
        const nextDueDate = format(nextDate!, "yyyy-MM-dd");
        const oldDueDate = task.due_date;
        const oldDueTime = task.due_time;

        await updateTask(task.id, {
          due_date: nextDueDate,
          due_time: nextTime || null,
          reschedule_count: (task.reschedule_count ?? 0) + 1,
          reschedule_reason: rescheduleReason.trim(),
          reminder_offset_hours: reminderOffsetHours ? parseInt(reminderOffsetHours, 10) : null,
          custom_reminder_at: customReminderAt || null,
        });

        await logTaskActivity(task.id, "rescheduled", {
          old_value: { due_date: oldDueDate, due_time: oldDueTime },
          new_value: { due_date: nextDueDate, due_time: nextTime || null },
          reason: rescheduleReason.trim(),
          reschedule_count: (task.reschedule_count ?? 0) + 1,
        });

        // Log to lead timeline
        if (task.lead_id) {
          await logLeadActivity(
            task.lead_id,
            `Task Rescheduled: ${task.title} — ${rescheduleReason.trim()}`,
            { task_id: task.id, old_due_date: oldDueDate, new_due_date: nextDueDate, reason: rescheduleReason.trim() },
            task.id
          );
        }

        // Log to staff activity
        try {
          if (user) {
            await logToStaffActivity("task_rescheduled", user.email || "", user.id, `Rescheduled task: ${task.title} to ${nextDueDate}`, "task", task.id);
          }
        } catch (_) {}
      }

      // 4b) Follow-up: create NEW task
      if (nextAction === "follow_up") {
        const nextDueDate = format(nextDate!, "yyyy-MM-dd");

        const nextTask: TaskInsert = {
          title: `Follow-up: ${task.title}`,
          description: task.completion_notes || task.description || null,
          type: task.type,
          priority: task.priority,
          status: "Pending",
          assigned_to: task.assigned_to,
          due_date: nextDueDate,
          due_time: nextTime || null,
          lead_id: task.lead_id,
          reminder: task.reminder,
          reminder_time: task.reminder_time,
          is_starred: task.is_starred,
          related_entity_type: task.related_entity_type,
          related_entity_id: task.related_entity_id,
          parent_task_id: task.id,
          original_due_date: nextDueDate,
          reminder_offset_hours: reminderOffsetHours ? parseInt(reminderOffsetHours, 10) : null,
          custom_reminder_at: customReminderAt || null,
        };

        const newTask = await addTask(nextTask);

        await logTaskActivity(task.id, "follow_up_created", {
          new_task_id: newTask?.id,
          new_task_title: `Follow-up: ${task.title}`,
          due_date: nextDueDate,
        });

        // Auto-close parent task when follow-up is created (even if closeTask wasn't checked)
        if (!closeTask) {
          await updateTask(task.id, {
            status: "Completed",
            completed_at: new Date().toISOString(),
            closed_at: new Date().toISOString(),
            closed_by: user?.id,
            completion_notes: notes.trim() || `Follow-up created: Follow-up: ${task.title}`,
          });
          await logTaskActivity(task.id, "closed", {
            closed_by: user?.id,
            reason: "Auto-closed: follow-up task created",
          });
        }

        // Log follow-up creation to lead timeline
        if (task.lead_id && newTask) {
          try {
            await supabase.from("activity_log").insert({
              lead_id: task.lead_id,
              activity_type: "task_created",
              activity_category: "task",
              user_id: user?.id || null,
              user_name: profile?.full_name || user?.email?.split("@")[0] || "System",
              title: `Follow-up Task Created: Follow-up: ${task.title}`,
              metadata: {
                task_id: newTask.id,
                parent_task_id: task.id,
                parent_task_title: task.title,
                due_date: nextDueDate,
                assigned_to: task.assigned_to,
              } as any,
              related_entity_type: "task",
              related_entity_id: newTask.id,
              is_manual: false,
              is_editable: false,
            });
          } catch (e) { console.warn("Failed to log follow-up to lead activity:", e); }
        }
      }

      // 5) Log to lead activity_log if lead_id exists
      if (task.lead_id) {
        const title = closeTask
          ? `Task Closed: ${task.title} — ${outcome}`
          : `Task Outcome: ${task.title} — ${outcome}`;
        await logLeadActivity(task.lead_id, title, { task_id: task.id, outcome, closed: closeTask }, task.id);
      }

      // 6) Log to staff_activity_log
      try {
        if (user) {
          const desc = closeTask
            ? `Closed task: ${task.title} (${outcome})`
            : `Recorded outcome for task: ${task.title} (${outcome})`;
          await logToStaffActivity(closeTask ? "task_closed" : "task_outcome_recorded", user.email || "", user.id, desc, "task", task.id);
        }
      } catch (_) {}

      toast({
        title: closeTask ? "Task closed" : "Outcome saved",
        description:
          nextAction === "convert_to_deal"
            ? "Marked as ready to convert to deal."
            : nextAction === "reschedule"
              ? "Task rescheduled."
              : nextAction === "follow_up"
                ? "Follow-up task created."
                : closeTask
                  ? "Task has been closed."
                  : "Outcome recorded, task stays open.",
      });

      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!task) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[70]">
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>No task selected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle>{closeTask ? "Close Task" : "Record Outcome"}</DialogTitle>
          <DialogDescription>
            {closeTask
              ? `Close "${task.title}" with an outcome and notes.`
              : `Record outcome for "${task.title}". Task will stay open unless you check "Close Task".`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector */}
          {hasTemplates && (
            <div className="space-y-2">
              <Label>Quick Template (optional)</Label>
              <Select value={selectedTemplateId || ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select a template"} />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Outcome + Next Action row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Outcome *</Label>
              <Select
                value={outcome}
                onValueChange={(v) => { setOutcome(v); setErrors((p) => ({ ...p, outcome: undefined })); }}
              >
                <SelectTrigger className={cn(errors.outcome && "border-destructive")}>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {OUTCOME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.outcome && <p className="text-sm text-destructive">{errors.outcome}</p>}
            </div>

            <div className="space-y-2">
              <Label>Next Action {!closeTask && "*"}</Label>
              <Select
                value={nextAction}
                onValueChange={(v) => { setNextAction(v as any); setErrors((p) => ({ ...p, nextAction: undefined })); }}
              >
                <SelectTrigger className={cn(errors.nextAction && "border-destructive")}>
                  <SelectValue placeholder="Select next action" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {nextActionOptions.map((a) => (
                    <SelectItem key={a.value} value={a.value} disabled={a.disabled}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.nextAction && <p className="text-sm text-destructive">{errors.nextAction}</p>}
            </div>
          </div>

          {/* Date/Time for follow-up or reschedule */}
          {(nextAction === "follow_up" || nextAction === "reschedule") && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Next Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !nextDate && "text-muted-foreground",
                          errors.nextDate && "border-destructive"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {nextDate ? format(nextDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[80]" align="start">
                      <Calendar
                        mode="single"
                        selected={nextDate}
                        onSelect={(d) => { setNextDate(d || undefined); setErrors((p) => ({ ...p, nextDate: undefined })); }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.nextDate && <p className="text-sm text-destructive">{errors.nextDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Next Time *</Label>
                  <Input
                    type="time"
                    value={nextTime}
                    min={minTimeForToday}
                    onChange={(e) => { setNextTime(e.target.value); setErrors((p) => ({ ...p, nextTime: undefined })); }}
                    className={cn(errors.nextTime && "border-destructive")}
                  />
                  {errors.nextTime && <p className="text-sm text-destructive">{errors.nextTime}</p>}
                </div>
              </div>

              {/* Reschedule reason (only for reschedule) */}
              {nextAction === "reschedule" && (
                <div className="space-y-2">
                  <Label>Reschedule Reason *</Label>
                  <Textarea
                    value={rescheduleReason}
                    onChange={(e) => { setRescheduleReason(e.target.value); setErrors((p) => ({ ...p, rescheduleReason: undefined })); }}
                    className={cn(errors.rescheduleReason && "border-destructive")}
                    placeholder="Why is this task being rescheduled?"
                    rows={2}
                  />
                  {errors.rescheduleReason && <p className="text-sm text-destructive">{errors.rescheduleReason}</p>}
                </div>
              )}

              {/* Reminder fields for follow-up/reschedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Auto Reminder (hours before)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    placeholder="e.g. 2"
                    value={reminderOffsetHours}
                    onChange={(e) => setReminderOffsetHours(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for no auto-reminder</p>
                </div>
                <div className="space-y-2">
                  <Label>Custom Reminder At</Label>
                  <Input
                    type="datetime-local"
                    value={customReminderAt}
                    onChange={(e) => setCustomReminderAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Specific date/time for reminder</p>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Completion Notes *</Label>
            <Textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setErrors((p) => ({ ...p, notes: undefined })); }}
              className={cn(errors.notes && "border-destructive")}
              placeholder="Write what happened, what you learned, and the next step..."
            />
            <div className="flex items-center justify-between">
              <p className={cn("text-xs", notes.trim().length < minNotes ? "text-destructive" : "text-muted-foreground")}>
                {notes.trim().length}/{minNotes} minimum
              </p>
              {saving && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />Saving...
                </span>
              )}
            </div>
            {errors.notes && <p className="text-sm text-destructive">{errors.notes}</p>}
          </div>

          {/* Close Task checkbox */}
          <div className="flex items-center space-x-2 rounded-md border border-border p-3 bg-muted/30">
            <Checkbox
              id="close-task"
              checked={closeTask}
              onCheckedChange={(checked) => setCloseTask(checked === true)}
            />
            <div className="flex flex-col">
              <Label htmlFor="close-task" className="cursor-pointer font-medium">
                Close Task
              </Label>
              <p className="text-xs text-muted-foreground">
                Mark as completed and set closure timestamp. Leave unchecked to save outcome only.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {closeTask ? "Close Task" : "Save Outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
