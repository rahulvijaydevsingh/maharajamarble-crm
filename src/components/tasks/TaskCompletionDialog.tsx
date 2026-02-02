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

  const [nextDate, setNextDate] = useState<Date | undefined>(undefined);
  const [nextTime, setNextTime] = useState<string>("10:00");

  const [errors, setErrors] = useState<{
    outcome?: string;
    nextAction?: string;
    notes?: string;
    nextDate?: string;
    nextTime?: string;
  }>({});

  useEffect(() => {
    if (!open) return;
    // reset per open to avoid cross-task leakage
    setSelectedTemplateId(null);
    setOutcome(task?.completion_outcome || "");
    setNotes(task?.completion_notes || "");
    setNextAction((task?.next_action_type as NextActionType) || "");
    setNextDate(undefined);
    setNextTime("10:00");
    setErrors({});
  }, [open, task?.id]);

  useEffect(() => {
    if (!selectedTemplate) return;

    if (selectedTemplate.default_outcome) {
      setOutcome(selectedTemplate.default_outcome);
    }
    if (selectedTemplate.template_notes) {
      setNotes(selectedTemplate.template_notes);
    }
    if (selectedTemplate.default_next_action_type) {
      setNextAction(selectedTemplate.default_next_action_type as NextActionType);
    }
  }, [selectedTemplate]);

  const isUnsuccessful = outcomeKind(outcome) === "unsuccessful";
  const minNotes = 50;

  const nextActionOptions = useMemo(() => {
    const base: { value: NextActionType; label: string; disabled?: boolean }[] = [
      { value: "follow_up", label: "Create Follow-up" },
      { value: "reschedule", label: "Reschedule" },
      { value: "convert_to_deal", label: "Convert to Deal", disabled: isUnsuccessful },
    ];

    return base;
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
    return (
      nextDate.getFullYear() === now.getFullYear() &&
      nextDate.getMonth() === now.getMonth() &&
      nextDate.getDate() === now.getDate()
    );
  }, [nextDate]);

  const minTimeForToday = useMemo(() => {
    if (!isNextTimeToday) return undefined;
    // Force at least the next minute so HH:mm (minute precision) can't be <= now
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

  // If user picks "today", ensure the time isn't already in the past.
  useEffect(() => {
    if (!minTimeForToday) return;
    const cur = timeToMinutes(nextTime);
    const min = timeToMinutes(minTimeForToday);
    if (cur === null || min === null) return;
    if (cur < min) setNextTime(minTimeForToday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTimeForToday]);

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!task) return { valid: false, nextErrors: { notes: "No task selected" } };

    if (!outcome) nextErrors.outcome = "Outcome is required";
    if (!nextAction) nextErrors.nextAction = "Next action is required";
    if ((notes || "").trim().length < minNotes) nextErrors.notes = `Notes must be at least ${minNotes} characters`;

    if (nextAction === "follow_up" || nextAction === "reschedule") {
      if (!nextDate) nextErrors.nextDate = "Please pick the next date";
      if (!nextTime) nextErrors.nextTime = "Please pick the next time";
      if (nextDate && !nextDateTime) nextErrors.nextTime = "Invalid time";
      if (nextDate && nextDateTime && nextDateTime.getTime() <= Date.now()) {
        nextErrors.nextTime = "Next schedule must be in the future";
      }
    }

    if (isUnsuccessful && nextAction === "convert_to_deal") {
      nextErrors.nextAction = "Unsuccessful outcomes require Follow-up or Reschedule";
    }

    setErrors(nextErrors);
    return { valid: Object.keys(nextErrors).length === 0 };
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

      // 1) Complete current task (the attempt)
      await updateTask(task.id, {
        status: "Completed",
        completion_outcome: outcome,
        completion_notes: notes.trim(),
        completion_status,
        // Keep key points optional for now; can be added later
        attempt_count: attemptCount,
        last_attempt_at: nowIso,
        next_action_type: nextAction,
        next_action_payload,
        deal_ready: nextAction === "convert_to_deal" ? true : task.deal_ready ?? false,
        deal_ready_at: nextAction === "convert_to_deal" ? nowIso : task.deal_ready_at ?? null,
      });

      // 2) Create required next step when needed
      if (nextAction === "follow_up" || nextAction === "reschedule") {
        const nextDueDate = format(nextDate!, "yyyy-MM-dd");

        const nextTaskTitle =
          nextAction === "follow_up"
            ? `Follow-up: ${task.title}`
            : `Rescheduled: ${task.title}`;

        const nextTask: TaskInsert = {
          title: nextTaskTitle,
          description: null,
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
        };

        await addTask(nextTask);
      }

      toast({
        title: "Task completed",
        description:
          nextAction === "convert_to_deal"
            ? "Marked as ready to convert to deal."
            : "Next action created.",
      });

      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Could not complete task",
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle>Complete Task</DialogTitle>
          <DialogDescription>
            Outcome + next action + notes are required to complete “{task.title}”.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasTemplates && (
            <div className="space-y-2">
              <Label>Quick Template (optional)</Label>
              <Select value={selectedTemplateId || ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select a template"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Outcome *</Label>
              <Select
                value={outcome}
                onValueChange={(v) => {
                  setOutcome(v);
                  setErrors((p) => ({ ...p, outcome: undefined }));
                }}
              >
                <SelectTrigger className={cn(errors.outcome && "border-destructive")}>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.outcome && <p className="text-sm text-destructive">{errors.outcome}</p>}
            </div>

            <div className="space-y-2">
              <Label>Next Action *</Label>
              <Select
                value={nextAction}
                onValueChange={(v) => {
                  setNextAction(v as any);
                  setErrors((p) => ({ ...p, nextAction: undefined }));
                }}
              >
                <SelectTrigger className={cn(errors.nextAction && "border-destructive")}>
                  <SelectValue placeholder="Select next action" />
                </SelectTrigger>
                <SelectContent>
                  {nextActionOptions.map((a) => (
                    <SelectItem key={a.value} value={a.value} disabled={a.disabled}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.nextAction && <p className="text-sm text-destructive">{errors.nextAction}</p>}
            </div>
          </div>

          {(nextAction === "follow_up" || nextAction === "reschedule") && (
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
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={nextDate}
                      onSelect={(d) => {
                        setNextDate(d || undefined);
                        setErrors((p) => ({ ...p, nextDate: undefined }));
                      }}
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
                  onChange={(e) => {
                    setNextTime(e.target.value);
                    setErrors((p) => ({ ...p, nextTime: undefined }));
                  }}
                  className={cn(errors.nextTime && "border-destructive")}
                />
                {errors.nextTime && <p className="text-sm text-destructive">{errors.nextTime}</p>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Completion Notes *</Label>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setErrors((p) => ({ ...p, notes: undefined }));
              }}
              className={cn(errors.notes && "border-destructive")}
              placeholder="Write what happened, what you learned, and the next step..."
            />
            <div className="flex items-center justify-between">
              <p className={cn("text-xs", notes.trim().length < minNotes ? "text-destructive" : "text-muted-foreground")}>
                {notes.trim().length}/{minNotes} minimum
              </p>
              {saving && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
            {errors.notes && <p className="text-sm text-destructive">{errors.notes}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            Complete Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
