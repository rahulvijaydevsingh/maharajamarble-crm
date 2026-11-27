/**
 * Post-create effects for a new lead — the mobile mirror of the desktop lead
 * creation flow (`src/pages/Leads.tsx`, lines 44–262).
 *
 * The desktop does everything in one handler:
 *
 *   1. `addLead` — the lead row itself,
 *   2. Group 1 — the site professionals are auto-created / linked and the
 *      `lead_professionals` rows are written,
 *   3. Group 3 — the referrer is linked (`buildReferralLinkInsert`),
 *   4. a `"First Follow-up: <name>"` task of type `Follow-up Call`,
 *   5. a reminder — only when the "Set Reminder Alarm" box is ticked,
 *   6. an assignee notification — only when the task is assigned to somebody
 *      other than the signed-in actor.
 *
 * Everything after (1) is a *side effect*: it can fail even though the lead
 * was saved. This module therefore runs the steps one by one, reports exactly
 * which step failed, keeps the lead, and can re-run **only** the failed steps
 * — a retry never creates a second lead.
 *
 * Every side effect arrives through {@link LeadCreateEffectsDeps}, so the
 * whole flow can be unit tested in a node environment with fakes (no DOM, no
 * network, no Supabase).
 *
 * INVARIANT-04: `assigned_to`, `created_by` and `updated_by` always carry a
 * staff **full name** — never an email address and never a UUID. The values
 * are resolved by the caller and handed in as-is.
 *
 * The follow-up date is NOT written to the lead: the database trigger
 * `sync_followup_dates_on_task_change` derives `leads.next_follow_up` from
 * the tasks, so the mobile insert path must never write that column.
 */

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The post-create steps, in the exact order the desktop runs them.
 *
 * The order is part of the contract: Group 1 has to be written before the
 * Group 3 referral, and the reminder needs the id of the follow-up task.
 */
export const LEAD_CREATE_STEPS = [
  'professionals',
  'referral',
  'follow_up_task',
  'reminder',
  'notification',
] as const;

/** One post-create step. */
export type LeadCreateStep = (typeof LEAD_CREATE_STEPS)[number];

/** A human readable name for every step — used in the failure toast. */
export const LEAD_CREATE_STEP_LABELS: Record<LeadCreateStep, string> = {
  professionals: 'professional links',
  referral: 'referral link',
  follow_up_task: 'follow-up task',
  reminder: 'reminder',
  notification: 'assignee notification',
};

/* -------------------------------------------------------------------------- */
/* Payloads                                                                    */
/* -------------------------------------------------------------------------- */

/** The `tasks` row the desktop writes for a new lead. */
export interface LeadCreateTaskPayload {
  title: string;
  description?: string | null;
  type: 'Follow-up Call';
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending';
  /** The staff full name of the assignee. */
  assigned_to: string;
  /** `YYYY-MM-DD`. */
  due_date: string;
  /** `HH:MM`. */
  due_time: string;
  lead_id: string;
  /** The staff full name of the signed-in actor. */
  created_by: string;
  /** Mirrors the "Set Reminder Alarm" checkbox. */
  reminder: boolean;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}

/** The `reminders` row the desktop writes for a new lead. */
export interface LeadCreateReminderPayload {
  title: string;
  description: string;
  reminder_datetime: string;
  entity_type: 'task' | 'lead';
  entity_id: string;
  /** The staff full name of the assignee. */
  assigned_to: string;
}

/** The `notifications` row the desktop writes for a new lead. */
export interface LeadCreateNotificationPayload {
  /** The email address of the assignee — the notification inbox of that user. */
  user_id: string;
  title: string;
  message: string;
  type: 'lead_assigned';
  entity_type: 'lead';
  entity_id: string;
}

/** The toast the helper raises when a step fails. */
export interface LeadCreateToastMessage {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

/* -------------------------------------------------------------------------- */
/* Input / output                                                              */
/* -------------------------------------------------------------------------- */

export interface LeadCreateEffectsInput {
  /** The id of the saved lead. */
  leadId: string;
  /** The lead name — used for the task, reminder and notification copy. */
  leadName: string;
  /** The staff full name the lead (and the task) is assigned to. */
  assignedTo: string;
  /** The email of the assignee — needed for the assignee notification. */
  assignedToEmail?: string | null;
  /** The staff full name of the signed-in actor. */
  actorName: string;
  /** `YYYY-MM-DD` — the follow-up date. */
  dueDate: string;
  /** `HH:MM` — the follow-up time. */
  dueTime: string;
  /** The "Set Reminder Alarm" checkbox. */
  reminderEnabled: boolean;
  /** How many minutes before the follow-up the reminder fires. */
  reminderOffsetMinutes?: number;
  /** The task priority — the desktop default is `Medium`. */
  taskPriority?: 'Low' | 'Medium' | 'High';
  /** An optional task description. */
  taskDescription?: string | null;
  /** The professional the task is linked to, when there is one. */
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /**
   * The id of an already created follow-up task.
   *
   * It is used when only the reminder is retried: the reminder then attaches
   * to the task instead of falling back to the lead.
   */
  taskId?: string;
  /** Overrides the notification title. */
  notificationTitle?: string;
  /** Overrides the notification message. */
  notificationMessage?: string;
}

export interface LeadCreateEffectsResult {
  leadId: string;
  /** The id of the follow-up task, when it was created. */
  createdTaskId?: string;
  /** The steps that ran through — a skipped step counts as completed. */
  completedSteps: string[];
  /** The steps that failed. */
  failedSteps: string[];
  /** The error message of every failed step, keyed by step name. */
  errors: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Dependencies                                                                */
/* -------------------------------------------------------------------------- */

export interface LeadCreateEffectsDeps {
  /**
   * Creates the lead row.
   *
   * The effects runner NEVER calls it — the effects run *after* `addLead`
   * succeeded. It is part of the contract so a caller (and the unit test) can
   * prove that a retry never creates a second lead.
   */
  addLead?: (payload: Record<string, unknown>) => Promise<{ id?: string } | null | undefined>;
  /** Group 1 — the site professionals are created / linked. */
  syncProfessionals: (leadId: string) => Promise<void>;
  /** Group 3 — the referrer is linked. */
  linkReferral: (leadId: string) => Promise<void>;
  /** Creates the follow-up task and returns the created row. */
  addTask: (task: LeadCreateTaskPayload) => Promise<{ id?: string } | null | undefined>;
  /** Creates the reminder for the follow-up task. */
  addReminder: (reminder: LeadCreateReminderPayload) => Promise<void>;
  /** Sends the assignee notification. */
  notifyAssignee: (notification: LeadCreateNotificationPayload) => Promise<void>;
  /** Raises the user-facing toast. */
  toast?: (message: LeadCreateToastMessage) => void;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

/** The title of the follow-up task the desktop creates for a new lead. */
export function buildFirstFollowUpTaskTitle(leadName: string): string {
  return `First Follow-up: ${leadName}`;
}

/** The title of the reminder the desktop creates for a new lead. */
export function buildFirstFollowUpReminderTitle(leadName: string): string {
  return `Follow-up: ${leadName}`;
}

/**
 * True when the assignee notification has to be sent.
 *
 * The desktop only notifies the assignee when the task is assigned to
 * somebody **other** than the signed-in actor, and it needs the assignee's
 * email address for the notification inbox.
 */
export function shouldSendAssigneeNotification(input: LeadCreateEffectsInput): boolean {
  const assignee = (input.assignedTo ?? '').trim();
  const actor = (input.actorName ?? '').trim();
  if (!assignee) return false;
  if (assignee.toLowerCase() === actor.toLowerCase()) return false;
  if (!(input.assignedToEmail ?? '').trim()) return false;
  return true;
}

/**
 * The moment the reminder fires: the follow-up time minus the offset.
 *
 * The offset defaults to 30 minutes — the same default the desktop uses.
 */
export function computeReminderDatetime(
  dueDate: string,
  dueTime: string,
  offsetMinutes: number = 30,
): string {
  const time = /^\d{2}:\d{2}/.test(dueTime ?? '') ? dueTime : '09:00';
  const action = new Date(`${dueDate}T${time}:00`);
  if (Number.isNaN(action.getTime())) return new Date().toISOString();
  const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : 30;
  return new Date(action.getTime() - offset * 60 * 1000).toISOString();
}

/** The `tasks` payload for the follow-up task of a new lead. */
export function buildFirstFollowUpTask(
  input: LeadCreateEffectsInput,
): LeadCreateTaskPayload {
  const task: LeadCreateTaskPayload = {
    title: buildFirstFollowUpTaskTitle(input.leadName),
    description: input.taskDescription ?? null,
    type: 'Follow-up Call',
    priority: input.taskPriority ?? 'Medium',
    status: 'Pending',
    assigned_to: input.assignedTo,
    due_date: input.dueDate,
    due_time: input.dueTime,
    lead_id: input.leadId,
    created_by: input.actorName,
    reminder: input.reminderEnabled,
  };
  if (input.relatedEntityType && input.relatedEntityId) {
    task.related_entity_type = input.relatedEntityType;
    task.related_entity_id = input.relatedEntityId;
  }
  return task;
}

/** The `reminders` payload for the follow-up task of a new lead. */
export function buildFirstFollowUpReminder(
  input: LeadCreateEffectsInput,
  taskId?: string,
): LeadCreateReminderPayload {
  const attachedToTask = Boolean(taskId);
  return {
    title: buildFirstFollowUpReminderTitle(input.leadName),
    description: `Lead: ${input.leadName}`,
    reminder_datetime: computeReminderDatetime(
      input.dueDate,
      input.dueTime,
      input.reminderOffsetMinutes,
    ),
    entity_type: attachedToTask ? 'task' : 'lead',
    entity_id: attachedToTask ? (taskId as string) : input.leadId,
    assigned_to: input.assignedTo,
  };
}

/** The `notifications` payload for the assignee of a new lead. */
export function buildAssigneeNotification(
  input: LeadCreateEffectsInput,
): LeadCreateNotificationPayload {
  return {
    user_id: (input.assignedToEmail ?? '').trim(),
    title: input.notificationTitle ?? 'New Lead Assigned',
    message:
      input.notificationMessage ??
      `${input.leadName || input.assignedTo} — a new lead has been assigned to you.`,
    type: 'lead_assigned',
    entity_type: 'lead',
    entity_id: input.leadId,
  };
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                  */
/* -------------------------------------------------------------------------- */

/** Normalises an unknown thrown value into a message. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'The step could not be completed.';
}

/**
 * Runs one step.
 *
 * Returns the id of the created task for `follow_up_task`, `undefined` for
 * every other step.
 */
async function runStep(
  step: LeadCreateStep,
  input: LeadCreateEffectsInput,
  deps: LeadCreateEffectsDeps,
  createdTaskId: string | undefined,
): Promise<string | undefined> {
  switch (step) {
    case 'professionals':
      await deps.syncProfessionals(input.leadId);
      return undefined;
    case 'referral':
      await deps.linkReferral(input.leadId);
      return undefined;
    case 'follow_up_task': {
      const created = await deps.addTask(buildFirstFollowUpTask(input));
      return created?.id ?? undefined;
    }
    case 'reminder': {
      // No reminder without the "Set Reminder Alarm" checkbox.
      if (!input.reminderEnabled) return undefined;
      const taskId = createdTaskId ?? input.taskId;
      await deps.addReminder(buildFirstFollowUpReminder(input, taskId));
      return undefined;
    }
    case 'notification': {
      // Nobody is notified about their own work.
      if (!shouldSendAssigneeNotification(input)) return undefined;
      await deps.notifyAssignee(buildAssigneeNotification(input));
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Runs the given steps in order and collects the outcome.
 *
 * A failing step never stops the following steps — the lead is already
 * saved, so every remaining effect is still worth trying.
 */
async function runSteps(
  input: LeadCreateEffectsInput,
  deps: LeadCreateEffectsDeps,
  steps: LeadCreateStep[],
): Promise<LeadCreateEffectsResult> {
  const completedSteps: string[] = [];
  const failedSteps: string[] = [];
  const errors: Record<string, string> = {};
  let createdTaskId: string | undefined;

  for (const step of steps) {
    try {
      const taskId = await runStep(step, input, deps, createdTaskId);
      if (taskId) createdTaskId = taskId;
      completedSteps.push(step);
    } catch (error) {
      failedSteps.push(step);
      errors[step] = errorMessage(error);
    }
  }

  return {
    leadId: input.leadId,
    ...(createdTaskId ? { createdTaskId } : {}),
    completedSteps,
    failedSteps,
    errors,
  };
}

/** The names of the failed steps, for the toast copy. */
export function describeFailedSteps(failedSteps: string[]): string {
  return failedSteps
    .map((step) => LEAD_CREATE_STEP_LABELS[step as LeadCreateStep] ?? step)
    .join(', ');
}

/**
 * Raises the failure toast — it names the step that failed.
 */
function reportFailure(
  failedSteps: string[],
  errors: Record<string, string>,
  deps: LeadCreateEffectsDeps,
): void {
  if (!deps.toast) return;
  const names = describeFailedSteps(failedSteps);
  const details = failedSteps
    .map((step) => `${LEAD_CREATE_STEP_LABELS[step as LeadCreateStep] ?? step}: ${errors[step] ?? ''}`)
    .join(' · ');
  deps.toast({
    title: `Lead saved, but the ${names} failed`,
    description: `${details} — the lead was saved. Retry the failed step${failedSteps.length === 1 ? '' : 's'} from the lead.`,
    variant: 'destructive',
  });
}

/**
 * Runs the post-create effects of a new lead.
 *
 * Call it **after** `addLead` succeeded. The lead is never touched here — a
 * failing step only produces a step-level error, and the caller decides what
 * to do about it.
 */
export async function runLeadCreateEffects(
  input: LeadCreateEffectsInput,
  deps: LeadCreateEffectsDeps,
): Promise<LeadCreateEffectsResult> {
  const result = await runSteps(input, deps, [...LEAD_CREATE_STEPS]);
  if (result.failedSteps.length > 0) {
    reportFailure(result.failedSteps, result.errors, deps);
  }
  return result;
}

/**
 * Re-runs **only** the given steps.
 *
 * The lead is never re-created — this is the retry path for a partially
 * failed lead creation.
 */
export async function retryLeadCreateEffects(
  input: LeadCreateEffectsInput,
  deps: LeadCreateEffectsDeps,
  failedSteps: string[],
): Promise<LeadCreateEffectsResult> {
  const steps = (failedSteps ?? []).filter((step): step is LeadCreateStep =>
    (LEAD_CREATE_STEPS as readonly string[]).includes(step),
  );
  const result = await runSteps(input, deps, steps);
  if (result.failedSteps.length > 0) {
    reportFailure(result.failedSteps, result.errors, deps);
  }
  return result;
}

/**
 * Creates the lead and then runs the post-create effects.
 *
 * The convenience entry point for a caller that has the whole flow at hand:
 * the lead is created once, the effects run afterwards, and a failing effect
 * never creates a second lead.
 */
export async function createLeadWithEffects(
  leadPayload: Record<string, unknown>,
  input: Omit<LeadCreateEffectsInput, 'leadId'>,
  deps: LeadCreateEffectsDeps,
): Promise<LeadCreateEffectsResult> {
  if (typeof deps.addLead !== 'function') {
    throw new Error('createLeadWithEffects requires an `addLead` dependency.');
  }
  const created = await deps.addLead(leadPayload);
  const leadId = created?.id;
  if (!leadId) throw new Error('The lead could not be created.');
  return runLeadCreateEffects({ ...input, leadId }, deps);
}
