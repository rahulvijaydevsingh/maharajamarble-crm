/**
 * Task write actions for the mobile workspace.
 *
 * The desktop completion contract (`src/components/tasks/TaskCompletionDialog.tsx`)
 * is a three step sequence:
 *
 *  1. `updateTask(task.id, { status: 'Completed' })` — this is the write that
 *     sets `completed_at`,
 *  2. the CALLER then creates the next occurrence of a recurring task with
 *     `createNextRecurringInstance(task.id)` — `updateTask` never does this by
 *     itself,
 *  3. the alarm mirrored from the task (`reminders.entity_type = 'task'`) is
 *     dismissed, so the bell does not fire for a task that is already closed.
 *
 * These helpers implement that contract exactly once, so every mobile surface
 * (Today, Work, task sheet, call sheet, entity profile) behaves the same way.
 * Every dependency is injected, which keeps the module free of React, of the
 * Supabase client and of the DOM — it is unit tested as pure logic.
 */

import type { TaskInsert } from '@/hooks/useTasks';

/** Status written by {@link completeTaskWithRecurrence}. */
export const TASK_STATUS_COMPLETED = 'Completed';

/** Status written by {@link cancelTaskWithCleanup}. */
export const TASK_STATUS_CANCELLED = 'Cancelled';

/**
 * The minimal reminder shape the cleanup depends on.
 *
 * A live `Reminder` from `useReminders()` satisfies this interface, so the
 * screens can hand their own list straight to the helpers.
 */
export interface TaskReminderLike {
  id: string;
  entity_type: string;
  entity_id: string;
  is_dismissed?: boolean;
  is_snoozed?: boolean;
}

/** The task fields the actions depend on. */
export interface TaskActionTarget {
  id: string;
  is_recurring?: boolean | null;
}

/** The update payload accepted by `useTasks().updateTask`. */
export type TaskActionUpdate = Partial<TaskInsert> & {
  completed_at?: string | null;
  snoozed_until?: string | null;
};

/**
 * Everything the actions need from the outside world.
 *
 * All of it is injectable so the unit tests can drive the helpers with fakes.
 */
export interface TaskActionDeps {
  /** `useTasks().updateTask` — performs the status write. */
  updateTask: (taskId: string, updates: TaskActionUpdate) => Promise<unknown>;
  /**
   * `useTasks().createNextRecurringInstance` — creates the next occurrence of
   * a recurring task. Optional: it is only called for a recurring task, and a
   * missing implementation simply means no next occurrence is created.
   */
  createNextRecurringInstance?: (taskId: string) => Promise<unknown>;
  /** `useReminders().dismissReminder` — silences the task's alarm. */
  dismissReminder?: (reminderId: string) => Promise<unknown>;
  /** The reminders the cleanup may consider. */
  reminders?: TaskReminderLike[];
  /** Surfaces a human readable failure (a toast, an inline error…). */
  onError?: (message: string) => void;
}

/** The outcome of a task action. */
export interface TaskActionResult {
  /** True when the whole action succeeded. */
  ok: boolean;
  /** The failure message when `ok` is false. */
  error?: string;
  /** True when a next recurring occurrence was created. */
  createdNextInstance?: boolean;
  /** The ids of the reminders this action dismissed. */
  dismissedReminderIds: string[];
}

/**
 * The reminder ids that belong to one task and are still active.
 *
 * The scope is deliberately strict: only `entity_type === 'task'` rows with
 * the exact `entity_id` qualify, and an already dismissed reminder is
 * skipped. Reminders that belong to a lead, a customer, a professional or to
 * another task are never returned — dismissing them would silence an alarm
 * that is still relevant.
 */
export function taskScopedReminderIds(
  taskId: string,
  reminders?: TaskReminderLike[],
): string[] {
  if (!Array.isArray(reminders) || reminders.length === 0) return [];
  if (!taskId) return [];

  return reminders
    .filter(
      (reminder) =>
        !!reminder &&
        reminder.entity_type === 'task' &&
        reminder.entity_id === taskId &&
        reminder.is_dismissed !== true,
    )
    .map((reminder) => reminder.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/** A readable message for an unknown thrown value. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

/**
 * Dismisses the active alarms of one task.
 *
 * A failing dismissal never undoes the status change — the task is already
 * closed, and the alarm can still be silenced by hand. The ids that were
 * dismissed successfully are returned.
 */
async function dismissTaskReminders(
  taskId: string,
  deps: TaskActionDeps,
): Promise<string[]> {
  const ids = taskScopedReminderIds(taskId, deps.reminders);
  if (ids.length === 0 || !deps.dismissReminder) return [];

  const dismissed: string[] = [];
  for (const id of ids) {
    try {
      await deps.dismissReminder(id);
      dismissed.push(id);
    } catch {
      // Non-fatal: the status write already succeeded.
    }
  }
  return dismissed;
}

/**
 * Completes a task the way the desktop does.
 *
 * The status is written first, a recurring task then rolls forward into its
 * next occurrence, and only afterwards the task's own alarms are dismissed.
 * Any failure is caught, reported through `deps.onError` and returned as
 * `ok: false` — the helper never throws at its caller.
 */
export async function completeTaskWithRecurrence(
  task: TaskActionTarget,
  deps: TaskActionDeps,
): Promise<TaskActionResult> {
  if (!task || !task.id) {
    const message = 'The task could not be completed because it has no id.';
    deps.onError?.(message);
    return { ok: false, error: message, createdNextInstance: false, dismissedReminderIds: [] };
  }

  try {
    await deps.updateTask(task.id, { status: TASK_STATUS_COMPLETED });
  } catch (error) {
    const message = describeError(
      error,
      'The task could not be completed. Please try again in a moment.',
    );
    deps.onError?.(message);
    return { ok: false, error: message, createdNextInstance: false, dismissedReminderIds: [] };
  }

  let createdNextInstance = false;
  if (task.is_recurring && deps.createNextRecurringInstance) {
    try {
      await deps.createNextRecurringInstance(task.id);
      createdNextInstance = true;
    } catch (error) {
      const message = describeError(
        error,
        'The task was completed, but the next recurring occurrence could not be created.',
      );
      deps.onError?.(message);
      const dismissedReminderIds = await dismissTaskReminders(task.id, deps);
      return {
        ok: false,
        error: message,
        createdNextInstance: false,
        dismissedReminderIds,
      };
    }
  }

  const dismissedReminderIds = await dismissTaskReminders(task.id, deps);
  return { ok: true, createdNextInstance, dismissedReminderIds };
}

/**
 * Cancels a task and silences the alarms it left behind.
 *
 * A cancelled task never rolls forward — no next occurrence is created — and
 * the task scoped reminders are dismissed exactly like on completion.
 */
export async function cancelTaskWithCleanup(
  task: TaskActionTarget,
  deps: TaskActionDeps,
): Promise<TaskActionResult> {
  if (!task || !task.id) {
    const message = 'The task could not be cancelled because it has no id.';
    deps.onError?.(message);
    return { ok: false, error: message, createdNextInstance: false, dismissedReminderIds: [] };
  }

  try {
    await deps.updateTask(task.id, { status: TASK_STATUS_CANCELLED });
  } catch (error) {
    const message = describeError(
      error,
      'The task could not be cancelled. Please try again in a moment.',
    );
    deps.onError?.(message);
    return { ok: false, error: message, createdNextInstance: false, dismissedReminderIds: [] };
  }

  const dismissedReminderIds = await dismissTaskReminders(task.id, deps);
  return { ok: true, createdNextInstance: false, dismissedReminderIds };
}
