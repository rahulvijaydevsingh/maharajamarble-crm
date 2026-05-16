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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Calendar as CalendarIcon, Loader2, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTaskCompletionTemplates } from "@/hooks/useTaskCompletionTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logToStaffActivity } from "@/lib/staffActivityLogger";
import type { Task, TaskInsert } from "@/hooks/useTasks";
import { TaskFormFields } from "./form/TaskFormFields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import {
  TASK_TYPES as FALLBACK_TASK_TYPES,
  KIT_TASK_TYPES as FALLBACK_KIT_TASK_TYPES,
  TASK_PRIORITIES as FALLBACK_TASK_PRIORITIES,
} from "@/constants/taskConstants";

type NextActionType = "follow_up" | "reschedule" | "convert_to_deal";

const OUTCOME_OPTIONS = [
  { value: "Successful", kind: "success" as const },
  { value: "No Answer", kind: "unsuccessful" as const },
  { value: "Call Back Later", kind: "unsuccessful" as const },
  { value: "Not Interested", kind: "unsuccessful" as const },
  { value: "Wrong Number", kind: "unsuccessful" as const },
  { value: "Rescheduled by Client", kind: "unsuccessful" as const },
];

const BUSINESS_HOUR_SLOTS = (() => {
  const slots: { label: string; value: string }[] = [];
  for (let h = 9; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) break;
      const label = `${h > 12 ? h - 12 : h}:${m === 0 ? "00" : "30"} ${h >= 12 ? "PM" : "AM"}`;
      const value = `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
      slots.push({ label, value });
    }
  }
  return slots;
})();

function outcomeKind(outcome: string | null) {
  return OUTCOME_OPTIONS.find((o) => o.value === outcome)?.kind ?? null;
}

const getActiveZone = (time: string) => {
  if (!time) return null;
  if (time >= "08:00" && time <= "11:59") return "morning";
  if (time >= "12:00" && time <= "16:59") return "afternoon";
  if (time >= "17:00" && time <= "20:00") return "evening";
  return null;
};

const zoneSlots = {
  morning: ["08:00", "09:00", "10:00", "11:00"],
  afternoon: ["12:00", "13:00", "14:00", "15:00", "16:00"],
  evening: ["17:00", "18:00", "19:00", "20:00"],
};

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
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { getFieldOptions } = useControlPanelSettings();

  const TASK_TYPES = useMemo(() => {
    const cp = getFieldOptions("tasks", "type");
    return cp.length > 0
      ? cp.filter(o => !o.value.startsWith("KIT")).map(o => o.value)
      : FALLBACK_TASK_TYPES;
  }, [getFieldOptions]);

  const KIT_TASK_TYPES = useMemo(() => {
    const cp = getFieldOptions("tasks", "type");
    return cp.length > 0
      ? cp.filter(o => o.value.startsWith("KIT")).map(o => o.value)
      : FALLBACK_KIT_TASK_TYPES;
  }, [getFieldOptions]);

  const TASK_PRIORITIES = useMemo(() => {
    const cp = getFieldOptions("tasks", "priority");
    return cp.length > 0
      ? cp.map(o => ({
          value: o.value, label: o.label,
          color: o.color ? `text-[${o.color}]` : "text-foreground"
        }))
      : FALLBACK_TASK_PRIORITIES;
  }, [getFieldOptions]);

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
  const [showCustomReminder, setShowCustomReminder] = useState(false);

  const [rescheduleReason, setRescheduleReason] = useState<string>("");

  // Follow-up task inline form state
  const [followUpExpanded, setFollowUpExpanded] = useState(false);
  const [followUpFormData, setFollowUpFormData] = useState({
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
  const [followUpRecurrence, setFollowUpRecurrence] = useState({
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
  const [followUpSubtasks, setFollowUpSubtasks] = useState<
    Array<{ id: string; title: string; is_completed: boolean }>
  >([]);
  const [followUpShowAdvanced, setFollowUpShowAdvanced] = useState(false);
  const [followUpErrors, setFollowUpErrors] = useState<
    Record<string, string>
  >({});
  const [followUpCharCount, setFollowUpCharCount] = useState(0);

  const rescheduleReasonSuggestions = useMemo(() => {
    if (outcome === "No Answer")
      return ["No phone answer", "Phone switched off", "Busy tone", "Went to voicemail"];
    if (outcome === "Call Back Later")
      return ["Client requested callback", "Not available right now", "In a meeting", "Asked to call tomorrow"];
    if (outcome === "Not Interested")
      return ["Not interested at this time", "Already purchased elsewhere", "Budget constraints"];
    if (outcome === "Rescheduled by Client")
      return ["Client rescheduled", "Site visit postponed", "Decision pending"];
    return ["Follow-up required", "Client unavailable", "Timing not right"];
  }, [outcome]);

  const notesSuggestions = useMemo(() => {
    if (outcome === "No Answer")
      return [
        "Called, no answer",
        "Phone switched off",
        "Left a WhatsApp message",
        "Tried calling twice, no response",
      ];
    if (outcome === "Successful")
      return [
        "Client interested, follow-up scheduled",
        "Shared product details and pricing",
        "Client visited showroom",
        "Quotation discussed and sent",
        "Sample requested",
      ];
    if (outcome === "Call Back Later")
      return [
        "Client asked to call back",
        "Shared details via WhatsApp, awaiting response",
        "Client in meeting, will call later",
      ];
    if (outcome === "Not Interested")
      return [
        "Client not interested at this time",
        "Already purchased elsewhere",
        "Budget not aligned",
      ];
  if (outcome === "Wrong Number")
    return [
      "Wrong number, lead details updated",
      "Number does not exist",
      "Incorrect contact details — needs verification",
      "Called, number belongs to someone else",
    ];
    return [
      "Spoke with client",
      "Follow-up required",
      "Sent details via WhatsApp",
    ];
  }, [outcome]);

  const [errors, setErrors] = useState<{
    outcome?: string;
    nextAction?: string;
    notes?: string;
    nextDate?: string;
    nextTime?: string;
    rescheduleReason?: string;
    followUpDueDate?: string;
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
    setShowCustomReminder(false);
    setRescheduleReason("");
    setErrors({});

    // Reset follow-up state
    setFollowUpFormData({
      title: "", type: "Follow-up Call", assignedTo: "",
      priority: "Medium",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dueTime: "10:00", description: "", reminder: false,
      reminderTime: "30", isStarred: false,
    });
    setFollowUpRecurrence({
      isRecurring: false, frequency: "one-time", interval: 1,
      daysOfWeek: [], dayOfMonth: null,
      resetFromCompletion: false, endType: "never",
      endDate: undefined, occurrencesLimit: null,
    });
    setFollowUpSubtasks([]);
    setFollowUpExpanded(false);
    setFollowUpErrors({});
    setFollowUpCharCount(0);
  }, [open, task?.id]);

  useEffect(() => {
    if (nextAction === "follow_up" && task) {
      setFollowUpFormData(prev => ({
        ...prev,
        title: `Follow-up: ${task.title}`,
        type: task.type || "Follow-up Call",
        assignedTo: task.assigned_to || "",
        priority: task.priority || "Medium",
        dueDate: nextDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
        dueTime: nextTime || "10:00",
        description: notes || "",
      }));
      setFollowUpExpanded(false);
    }
  }, [nextAction]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.default_outcome) setOutcome(selectedTemplate.default_outcome);
    if (selectedTemplate.template_notes) setNotes(selectedTemplate.template_notes);
    if (selectedTemplate.default_next_action_type) setNextAction(selectedTemplate.default_next_action_type as NextActionType);
  }, [selectedTemplate]);

  const isUnsuccessful = outcomeKind(outcome) === "unsuccessful";
  const minNotes = 30;

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

  const followUpIsToday = useMemo(() => {
    const d = followUpFormData.dueDate;
    if (!d) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }, [followUpFormData.dueDate]);

  const followUpMinTime = useMemo(() => {
    if (!followUpIsToday) return "00:00";
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const roundedH = m >= 30 ? h + 1 : h;
    const roundedM = m >= 30 ? 0 : 30;
    return `${String(roundedH).padStart(2, "0")}:${String(roundedM).padStart(
      2,
      "0"
    )}`;
  }, [followUpIsToday]);

  const followUpActiveZone = getActiveZone(followUpFormData.dueTime);

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

    if (nextAction === "reschedule") {
      if (!nextDate) nextErrors.nextDate = "Please pick the next date";
      if (!nextTime) nextErrors.nextTime = "Please pick the next time";
      if (nextDate && !nextDateTime) nextErrors.nextTime = "Invalid time";
      if (nextDate && nextDateTime && nextDateTime.getTime() <= Date.now()) {
        nextErrors.nextTime = "Next schedule must be in the future";
      }
    }

    if (nextAction === "follow_up") {
      if (!followUpFormData.dueDate) {
        (nextErrors as any).followUpDueDate = "Follow-up date is required";
      }
      if (followUpIsToday && followUpFormData.dueTime < followUpMinTime) {
        setFollowUpErrors((prev) => ({
          ...prev,
          dueTime: "Follow-up time must be in the future",
        }));
        (nextErrors as any).followUpDueTime = "Follow-up time must be in the future";
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
    } catch (e: any) {
      console.error('[TaskCompletionDialog/logTaskActivity] Failed to insert to task_activity_log:', e?.message || e);
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
    } catch (e: any) {
      console.error('[TaskCompletionDialog/logLeadActivity] Failed to insert to activity_log:', e?.message || e);
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
          reminder_offset_hours: (reminderOffsetHours && reminderOffsetHours !== "custom") ? parseInt(reminderOffsetHours, 10) : null,
          custom_reminder_at: reminderOffsetHours === "custom" ? customReminderAt || null : null,
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
        } catch (_) {
          // Staff activity log is non-critical — failure is acceptable
        }
      }

      // 4b) Follow-up: create NEW task
      if (nextAction === "follow_up") {
        const nextTask: any = {
          title: followUpFormData.title.trim() ||
                 `Follow-up: ${task.title}`,
          type: followUpFormData.type,
          priority: followUpFormData.priority,
          assigned_to: followUpFormData.assignedTo ||
                       task.assigned_to,
          due_date: format(followUpFormData.dueDate, "yyyy-MM-dd"),
          due_time: followUpFormData.dueTime || null,
          status: "Pending",
          description: followUpFormData.description.trim() || null,
          reminder: followUpFormData.reminder,
          reminder_time: followUpFormData.reminder
            ? followUpFormData.reminderTime : null,
          is_starred: followUpFormData.isStarred,
          is_recurring: followUpRecurrence.isRecurring,
          recurrence_frequency: followUpRecurrence.isRecurring
            ? followUpRecurrence.frequency : null,
          recurrence_interval: followUpRecurrence.interval,
          recurrence_days_of_week:
            followUpRecurrence.daysOfWeek.length > 0
              ? followUpRecurrence.daysOfWeek : null,
          recurrence_day_of_month:
            followUpRecurrence.dayOfMonth,
          recurrence_reset_from_completion:
            followUpRecurrence.resetFromCompletion,
          recurrence_end_type: followUpRecurrence.endType,
          recurrence_end_date: followUpRecurrence.endDate
            ? format(followUpRecurrence.endDate, "yyyy-MM-dd") : null,
          recurrence_occurrences_limit:
            followUpRecurrence.occurrencesLimit,
          parent_task_id: task.id,
          lead_id: task.lead_id || null,
          related_entity_type: task.related_entity_type || null,
          related_entity_id: task.related_entity_id || null,
          reminder_offset_hours: (reminderOffsetHours && reminderOffsetHours !== "custom") ? parseInt(reminderOffsetHours, 10) : null,
          custom_reminder_at: reminderOffsetHours === "custom" ? customReminderAt || null : null,
          original_due_date: format(followUpFormData.dueDate, "yyyy-MM-dd"),
        };

        const newTask = await addTask(nextTask);

        if (newTask) {
          // Insert subtasks if any
          if (followUpSubtasks.length > 0) {
            const subtasksToInsert = followUpSubtasks.map((s, i) => ({
              task_id: newTask.id,
              title: s.title,
              sort_order: i,
            }));
            await supabase.from("task_subtasks").insert(subtasksToInsert);
          }

          await logTaskActivity(task.id, "follow_up_created", {
            new_task_id: newTask.id,
            new_task_title: newTask.title,
            due_date: newTask.due_date,
          });

          // Log follow-up creation to lead timeline
          if (task.lead_id) {
            try {
              await supabase.from("activity_log").insert({
                lead_id: task.lead_id,
                activity_type: "task_created",
                activity_category: "task",
                user_id: user?.id || null,
                user_name: profile?.full_name || user?.email?.split("@")[0] || "System",
                title: `Follow-up Task Created: ${newTask.title}`,
                metadata: {
                  task_id: newTask.id,
                  parent_task_id: task.id,
                  parent_task_title: task.title,
                  due_date: newTask.due_date,
                  assigned_to: newTask.assigned_to,
                } as any,
                related_entity_type: "task",
                related_entity_id: newTask.id,
                is_manual: false,
                is_editable: false,
              });
            } catch (e: any) { console.error('[TaskCompletionDialog/handleSubmit/follow_up] Failed to log follow-up creation to activity_log:', e?.message || e); }
          }
        }

        // Auto-close parent task when follow-up is created (even if closeTask wasn't checked)
        if (!closeTask) {
          await updateTask(task.id, {
            status: "Completed",
            completed_at: new Date().toISOString(),
            closed_at: new Date().toISOString(),
            closed_by: user?.id,
            completion_notes: notes.trim() || `Follow-up created: ${followUpFormData.title.trim() || `Follow-up: ${task.title}`}`,
          });
          await logTaskActivity(task.id, "closed", {
            closed_by: user?.id,
            reason: "Auto-closed: follow-up task created",
          });
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
      } catch (_) {
        // Staff activity log is non-critical — failure is acceptable
      }

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

  const currentNextTimeActiveZone = getActiveZone(nextTime);

  if (!task) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
<DialogContent className="z-[100]" overlayClassName="z-[100]">
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
<DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto z-[100]" overlayClassName="z-[100]">
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
<SelectContent className="z-[200]">
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
<SelectContent className="z-[200]">
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
<SelectContent className="z-[200]">
                  {nextActionOptions.map((a) => (
                    <SelectItem key={a.value} value={a.value} disabled={a.disabled}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.nextAction && <p className="text-sm text-destructive">{errors.nextAction}</p>}
            </div>
          </div>

          {/* Date/Time for reschedule */}
          {nextAction === "reschedule" && (
            <div className="space-y-4">
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
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={nextDate}
                        onSelect={(d) => { setNextDate(d || undefined); setErrors((p) => ({ ...p, nextDate: undefined })); }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.nextDate && <p className="text-sm text-destructive">{errors.nextDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Next Time *</Label>
                  <div className="space-y-3">
                    {/* Zone 1: Preset buttons */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("flex-1 text-xs h-8", currentNextTimeActiveZone === "morning" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                        onClick={() => {
                          setNextTime("10:00");
                          setErrors((p) => ({ ...p, nextTime: undefined }));
                        }}
                      >
                        Morning
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("flex-1 text-xs h-8", currentNextTimeActiveZone === "afternoon" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                        onClick={() => {
                          setNextTime("14:00");
                          setErrors((p) => ({ ...p, nextTime: undefined }));
                        }}
                      >
                        Afternoon
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("flex-1 text-xs h-8", currentNextTimeActiveZone === "evening" && "bg-primary text-primary-foreground hover:bg-primary/90")}
                        onClick={() => {
                          setNextTime("17:00");
                          setErrors((p) => ({ ...p, nextTime: undefined }));
                        }}
                      >
                        Evening
                      </Button>
                    </div>

                    {/* Zone 2: Range-specific slots */}
                    {currentNextTimeActiveZone && (
                      <div className="flex flex-wrap gap-1">
                        {zoneSlots[currentNextTimeActiveZone].map((slot) => (
                          <Button
                            key={slot}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-7 px-2 text-[10px] rounded-full",
                              nextTime === slot && "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                            onClick={() => {
                              setNextTime(slot);
                              setErrors((p) => ({ ...p, nextTime: undefined }));
                            }}
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
                        value={nextTime}
                        min={minTimeForToday}
                        onChange={(e) => {
                          setNextTime(e.target.value);
                          setErrors((p) => ({ ...p, nextTime: undefined }));
                        }}
                        className={cn("h-7 w-28 text-xs", errors.nextTime && "border-destructive")}
                      />
                    </div>
                  </div>
                  {errors.nextTime && <p className="text-sm text-destructive">{errors.nextTime}</p>}
                </div>
              </div>

              {/* Reschedule reason */}
              <div className="space-y-2">
                <Label>Reschedule Reason *</Label>
                {/* Quick-fill chips — outcome-aware */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {rescheduleReasonSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        const newVal = rescheduleReason === suggestion ? "" : suggestion;
                        setRescheduleReason(newVal);
                        setErrors((p) => ({ ...p, rescheduleReason: undefined }));
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer",
                        rescheduleReason === suggestion
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-muted/80 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={rescheduleReason}
                  onChange={(e) => {
                    setRescheduleReason(e.target.value);
                    setErrors((p) => ({ ...p, rescheduleReason: undefined }));
                  }}
                  className={cn(errors.rescheduleReason && "border-destructive")}
                  placeholder="Or type a custom reason..."
                  rows={2}
                />
                {errors.rescheduleReason && (
                  <p className="text-sm text-destructive">{errors.rescheduleReason}</p>
                )}
              </div>
            </div>
          )}

          {/* Compact Reminder row — shared for reschedule and follow-up */}
          {(nextAction === "reschedule" || nextAction === "follow_up") && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 shrink-0">
                  <Bell className="h-3.5 w-3.5" /> Reminder:
                </span>
                {[
                  { label: "1 hr", hours: "1" },
                  { label: "2 hr", hours: "2" },
                  { label: "3 hr", hours: "3" },
                  { label: "1 day", hours: "24" },
                  { label: "2 days", hours: "48" },
                  { label: "Custom", hours: "custom" },
                  { label: "None", hours: "" },
                ].map(({ label, hours }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (hours === "custom") {
                        setShowCustomReminder(prev => !prev);
                        if (reminderOffsetHours !== "custom") {
                          setReminderOffsetHours("custom");
                        }
                      } else {
                        setReminderOffsetHours(hours);
                        setShowCustomReminder(false);
                        if (hours === "") setCustomReminderAt("");
                      }
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors",
                      (reminderOffsetHours === hours ||
                        (hours === "custom" && reminderOffsetHours === "custom"))
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Custom reminder — compact inline row */}
              {showCustomReminder && (
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  {/* Date picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-7 text-xs justify-start font-normal w-32",
                          !customReminderAt && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3 w-3" />
                        {customReminderAt
                          ? format(new Date(customReminderAt), "MMM d")
                          : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={customReminderAt
                          ? new Date(customReminderAt) : undefined}
                        onSelect={(d) => {
                          if (!d) { setCustomReminderAt(""); return; }
                          const existingTime = customReminderAt
                            ? customReminderAt.split("T")[1] || "09:00"
                            : "09:00";
                          setCustomReminderAt(
                            `${format(d, "yyyy-MM-dd")}T${existingTime}`
                          );
                        }}
                        initialFocus
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Time select — compact */}
                  <Select
                    value={customReminderAt
                      ? customReminderAt.split("T")[1]?.slice(0, 5) || ""
                      : ""}
                    onValueChange={(t) => {
                      const datePart = customReminderAt
                        ? customReminderAt.split("T")[0]
                        : format(new Date(), "yyyy-MM-dd");
                      setCustomReminderAt(`${datePart}T${t}`);
                    }}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[180px] z-[200]">
                      <SelectGroup>
                        {BUSINESS_HOUR_SLOTS.filter((slot) => {
                          const datePart = customReminderAt
                            ? customReminderAt.split("T")[0]
                            : format(new Date(), "yyyy-MM-dd");
                          const isToday =
                            datePart === format(new Date(), "yyyy-MM-dd");
                          return !isToday ||
                            slot.value >= format(new Date(), "HH:mm");
                        }).map((slot) => (
                          <SelectItem key={slot.value} value={slot.value}>
                            {slot.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {customReminderAt && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomReminderAt("");
                        setShowCustomReminder(false);
                        setReminderOffsetHours("");
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Confirmation line */}
              {customReminderAt && (
                <p className="text-xs text-muted-foreground pl-1">
                  Reminder: {format(new Date(customReminderAt), "MMM d 'at' h:mm a")}
                </p>
              )}
              {reminderOffsetHours && reminderOffsetHours !== "" &&
               reminderOffsetHours !== "custom" && (
                <p className="text-xs text-muted-foreground pl-1">
                  Reminder {
                    reminderOffsetHours === "1" ? "1 hour" :
                    reminderOffsetHours === "24" ? "1 day" :
                    reminderOffsetHours === "48" ? "2 days" :
                    `${reminderOffsetHours} hours`
                  } before scheduled time.
                </p>
              )}
            </div>
          )}

          {/* Follow-up Due Date & Time — shown above the form for quick entry */}
          {nextAction === "follow_up" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !followUpFormData.dueDate && "text-muted-foreground",
                        followUpErrors.dueDate && "border-destructive"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {followUpFormData.dueDate ? format(followUpFormData.dueDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[200]" align="start">
                    <Calendar
                      mode="single"
                      selected={followUpFormData.dueDate}
                      onSelect={(date) => {
                        if (date) {
                          setFollowUpFormData(prev => ({ ...prev, dueDate: date }));
                          setFollowUpErrors(prev => ({ ...prev, dueDate: "" }));
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {followUpErrors.dueDate && <p className="text-sm text-destructive">{followUpErrors.dueDate}</p>}
              </div>

              <div className="space-y-2">
                <Label>Due Time</Label>
                <div className="space-y-3">
                  {/* Zone preset buttons */}
                  <div className="flex gap-2">
                    {(["morning", "afternoon", "evening"] as const).map((zone) => (
                      <Button
                        key={zone}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("flex-1 text-xs h-8 capitalize", followUpActiveZone === zone && "bg-primary text-primary-foreground hover:bg-primary/90")}
                        onClick={() => {
                          const defaults = { morning: "10:00", afternoon: "14:00", evening: "17:00" };
                          setFollowUpFormData(prev => ({ ...prev, dueTime: defaults[zone] }));
                          setFollowUpErrors(prev => ({ ...prev, dueTime: "" }));
                        }}
                      >
                        {zone.charAt(0).toUpperCase() + zone.slice(1)}
                      </Button>
                    ))}
                  </div>
                  {/* Hourly pills for active zone */}
                  {followUpActiveZone && (
                    <div className="flex flex-wrap gap-1">
                      {zoneSlots[followUpActiveZone].map((slot) => (
                        <Button
                          key={slot}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn("h-7 px-2 text-[10px] rounded-full", followUpFormData.dueTime === slot && "bg-primary text-primary-foreground hover:bg-primary/90")}
                          onClick={() => {
                            setFollowUpFormData(prev => ({ ...prev, dueTime: slot }));
                            setFollowUpErrors(prev => ({ ...prev, dueTime: "" }));
                          }}
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                  )}
                  {/* Custom time input */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">Custom:</span>
                    <Input
                      type="time"
                      value={followUpFormData.dueTime}
                      min={followUpMinTime}
                      onChange={(e) => {
                        setFollowUpFormData(prev => ({ ...prev, dueTime: e.target.value }));
                        setFollowUpErrors(prev => ({ ...prev, dueTime: "" }));
                      }}
                      className={cn("h-7 w-28 text-xs", followUpErrors.dueTime && "border-destructive")}
                    />
                  </div>
                </div>
                {followUpErrors.dueTime && <p className="text-sm text-destructive">{followUpErrors.dueTime}</p>}
              </div>
            </div>
          )}

          {/* Inline follow-up task form — independent block */}
          {nextAction === "follow_up" && (
            <div className="rounded-md border border-border bg-muted/20 overflow-hidden">
              {/* Collapsed summary header — always visible */}
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {followUpFormData.title || "Follow-up task"}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                      {followUpFormData.type}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                      {followUpFormData.priority}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowUpExpanded(prev => !prev)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
                >
                  {followUpExpanded ? (
                    <>Less <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Customise <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>

              {/* Expanded full form */}
              {followUpExpanded && (
                <div className="border-t border-border p-3 space-y-3">
                  <TaskFormFields
                    formData={followUpFormData}
                    onFormDataChange={(field, value) => {
                      setFollowUpFormData(prev => ({ ...prev, [field]: value }));
                      if (field === "description") setFollowUpCharCount(value.length);
                      if (followUpErrors[field]) {
                        setFollowUpErrors(prev => ({ ...prev, [field]: "" }));
                      }
                    }}
                    recurrenceData={followUpRecurrence}
                    onRecurrenceChange={(updates) =>
                      setFollowUpRecurrence(prev => ({ ...prev, ...updates }))
                    }
                    subtasks={followUpSubtasks}
                    onAddSubtask={(title) =>
                      setFollowUpSubtasks(prev => [
                        ...prev,
                        { id: crypto.randomUUID(), title, is_completed: false }
                      ])
                    }
                    onUpdateSubtask={(id, updates) =>
                      setFollowUpSubtasks(prev =>
                        prev.map(s => s.id === id ? { ...s, ...updates } : s)
                      )
                    }
                    onDeleteSubtask={(id) =>
                      setFollowUpSubtasks(prev =>
                        prev.filter(s => s.id !== id)
                      )
                    }
                    errors={followUpErrors}
                    staffMembers={staffMembers}
                    TASK_TYPES={TASK_TYPES}
                    KIT_TASK_TYPES={KIT_TASK_TYPES}
                    TASK_PRIORITIES={TASK_PRIORITIES}
                    showAdvanced={followUpShowAdvanced}
                    onShowAdvancedChange={setFollowUpShowAdvanced}
                    hideRelatedEntity={true}
                    hideReminder={true}
                    hideDueDateTime={true}
                    staffLoading={staffLoading}
                    characterCount={followUpCharCount}
                  />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Completion Notes *</Label>
            {/* Quick-fill chips */}
            <div className="flex flex-wrap gap-2 mb-2">
              {notesSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    const newVal = notes === suggestion ? "" : suggestion;
                    setNotes(newVal);
                    setErrors((p) => ({ ...p, notes: undefined }));
                  }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer",
                    notes === suggestion
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted hover:bg-muted/80 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setErrors((p) => ({ ...p, notes: undefined }));
              }}
              className={cn(errors.notes && "border-destructive")}
              placeholder="Write what happened, or pick a quick note above and edit it..."
              rows={3}
            />
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-xs",
                notes.trim().length < minNotes ? "text-destructive" : "text-muted-foreground"
              )}>
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
