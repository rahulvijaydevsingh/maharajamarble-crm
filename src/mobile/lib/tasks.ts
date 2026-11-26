/**
 * Task helpers for the mobile workspace.
 *
 * The orphan-safe filter below is a deliberate copy of the desktop rule in
 * `src/pages/Tasks.tsx` (lines 116-118). It keeps Customer and Professional
 * tasks visible (those always have `lead_id === null`) while excluding tasks
 * whose parent lead no longer resolves and soft-deleted tasks.
 *
 * Note: `src/components/tasks/EnhancedTaskTable.tsx` uses a *different* rule
 * that omits the `lead_id != null` guard, which wrongly files Customer and
 * Professional tasks under Recycle Bin. The desktop variant is out of scope
 * for Release 1; the mobile workspace follows the correct `Tasks.tsx` form.
 */

import type { CrmTask } from '@/mobile/types/crmTypes';
import { isSameLocalDay } from '@/mobile/lib/format';

export type TaskUrgency = 'overdue' | 'due_today' | 'upcoming' | 'completed' | 'cancelled';

/** Live task statuses that count as terminal. */
export const COMPLETED_TASK_STATUS = 'Completed';
export const CANCELLED_TASK_STATUS = 'Cancelled';

/**
 * The canonical orphan-safe task filter.
 *
 * Keeps a task when ALL of the following hold:
 *  - it is not soft deleted,
 *  - it is not an orphan (a non-null `lead_id` whose lead no longer resolves),
 *  - its parent lead is not itself deleted,
 *  - its status is not `Cancelled`.
 *
 * Customer and Professional tasks always have `lead_id === null` and a `null`
 * lead, so they survive this filter.
 */
export function isTaskActiveAndNotOrphan(task: CrmTask): boolean {
  if (!task) return false;
  if (task.is_deleted) return false;
  if (task.lead_id !== null && task.lead_id !== undefined && task.lead === null) return false;
  if (task.lead && task.lead.status === 'deleted') return false;
  if (task.status === CANCELLED_TASK_STATUS) return false;
  return true;
}

/** Applies {@link isTaskActiveAndNotOrphan} across a task list. */
export function filterActiveTasks(tasks: CrmTask[] | null | undefined): CrmTask[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(isTaskActiveAndNotOrphan);
}

/**
 * The rule for the "Cancelled" view.
 *
 * {@link isTaskActiveAndNotOrphan} deliberately excludes cancelled tasks, so
 * the cancelled list has to be derived from the raw universe instead. A
 * cancelled task is shown unless it was explicitly soft deleted — the desktop
 * keeps these in its Recycle Bin tab (`src/pages/Tasks.tsx:118`).
 */
export function isTaskCancelledForBin(task: CrmTask): boolean {
  if (!task) return false;
  if (task.is_deleted) return false;
  return task.status === CANCELLED_TASK_STATUS;
}

/** Applies {@link isTaskCancelledForBin} across a task list. */
export function filterCancelledTasks(tasks: CrmTask[] | null | undefined): CrmTask[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(isTaskCancelledForBin);
}

/** True when the task has been completed. */
export function isTaskCompleted(task: CrmTask): boolean {
  return task.status === COMPLETED_TASK_STATUS;
}

/** True when the task was cancelled. */
export function isTaskCancelled(task: CrmTask): boolean {
  return task.status === CANCELLED_TASK_STATUS;
}

/**
 * Classifies a task against a reference time. Overdue tasks sort first in
 * the mobile work list.
 */
export function getTaskUrgency(
  task: CrmTask,
  nowMs: number = Date.now(),
): TaskUrgency {
  if (isTaskCompleted(task)) return 'completed';
  if (isTaskCancelled(task)) return 'cancelled';
  const dueMs = task.due_at ? new Date(task.due_at).getTime() : NaN;
  if (!Number.isFinite(dueMs)) return 'upcoming';
  if (dueMs < nowMs) return 'overdue';
  return isSameLocalDay(new Date(dueMs), new Date(nowMs)) ? 'due_today' : 'upcoming';
}

/** Sort weight — overdue first, then due today, then upcoming. */
const URGENCY_WEIGHT: Record<TaskUrgency, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  cancelled: 3,
  completed: 4,
};

/**
 * Sorts tasks overdue-first, then by due time ascending. Ties fall back to the
 * creation time so the order is stable.
 *
 * An unparseable `due_at` must never throw and must never reorder the list —
 * such a task is treated as "no due date" and keeps its relative position
 * behind every dated task.
 */
export function sortTasksByUrgency(tasks: CrmTask[], nowMs: number = Date.now()): CrmTask[] {
  const dueTime = (task: CrmTask): number => {
    if (!task.due_at) return Number.MAX_SAFE_INTEGER;
    const parsed = new Date(task.due_at).getTime();
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  return [...tasks].sort((a, b) => {
    const urgencyDelta = URGENCY_WEIGHT[getTaskUrgency(a, nowMs)] - URGENCY_WEIGHT[getTaskUrgency(b, nowMs)];
    if (urgencyDelta !== 0) return urgencyDelta;
    const dueA = dueTime(a);
    const dueB = dueTime(b);
    if (dueA !== dueB) return dueA - dueB;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
}

/**
 * Human label for a task type.
 *
 * Task types live in the Control Panel Title Case value space, so the raw
 * value is already human readable. The optional label map lets the caller pass
 * the live `getOptionLabel('tasks', 'type', value)` result.
 */
export function taskTypeLabel(value?: string | null, labelMap?: Record<string, string>): string {
  if (!value) return 'Task';
  if (labelMap && labelMap[value]) return labelMap[value];
  return value;
}

/**
 * Returns the entity a task belongs to, preferring the explicit lead link and
 * falling back to the `related_entity_*` columns.
 */
export function taskEntityKind(task: CrmTask): 'lead' | 'customer' | 'professional' | null {
  if (task.lead_id) return 'lead';
  if (task.customer_id) return 'customer';
  if (task.professional_id) return 'professional';
  if (task.related_entity_type === 'customer') return 'customer';
  if (task.related_entity_type === 'professional') return 'professional';
  if (task.related_entity_type === 'lead') return 'lead';
  return null;
}
