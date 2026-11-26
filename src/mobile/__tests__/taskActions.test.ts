import { describe, expect, it, vi } from 'vitest';

import {
  cancelTaskWithCleanup,
  completeTaskWithRecurrence,
  taskScopedReminderIds,
  type TaskActionDeps,
  type TaskActionUpdate,
  type TaskReminderLike,
} from '@/mobile/lib/taskActions';

/** A reminder that belongs to the task under test. */
const taskReminder = (id: string, entityId: string): TaskReminderLike => ({
  id,
  entity_type: 'task',
  entity_id: entityId,
  is_dismissed: false,
  is_snoozed: false,
});

/** A reminder that belongs to somebody else — it must never be touched. */
const otherReminder = (id: string, entityType: string, entityId: string): TaskReminderLike => ({
  id,
  entity_type: entityType,
  entity_id: entityId,
  is_dismissed: false,
  is_snoozed: false,
});

function makeDeps(overrides: Partial<TaskActionDeps> = {}): TaskActionDeps {
  const updateTask = vi.fn(async (_taskId: string, _updates: TaskActionUpdate) => undefined);
  const createNextRecurringInstance = vi.fn(async (_taskId: string) => undefined);
  const dismissReminder = vi.fn(async (_reminderId: string) => undefined);
  const onError = vi.fn((_message: string) => undefined);

  return {
    updateTask,
    createNextRecurringInstance,
    dismissReminder,
    onError,
    ...overrides,
  };
}

describe('completeTaskWithRecurrence', () => {
  it('completes the task with the Completed status', async () => {
    const deps = makeDeps();

    const result = await completeTaskWithRecurrence({ id: 'task-1', is_recurring: false }, deps);

    expect(result.ok).toBe(true);
    expect(deps.updateTask).toHaveBeenCalledTimes(1);
    expect(deps.updateTask).toHaveBeenCalledWith('task-1', { status: 'Completed' });
  });

  it('creates the next occurrence of a recurring task', async () => {
    const deps = makeDeps();

    const result = await completeTaskWithRecurrence({ id: 'task-7', is_recurring: true }, deps);

    expect(result.ok).toBe(true);
    expect(deps.createNextRecurringInstance).toHaveBeenCalledTimes(1);
    expect(deps.createNextRecurringInstance).toHaveBeenCalledWith('task-7');
    expect(result.createdNextInstance).toBe(true);
  });

  it('does not create a next occurrence for a one-off task', async () => {
    const deps = makeDeps();

    const result = await completeTaskWithRecurrence({ id: 'task-1', is_recurring: false }, deps);

    expect(result.ok).toBe(true);
    expect(deps.createNextRecurringInstance).not.toHaveBeenCalled();
    expect(result.createdNextInstance).toBeFalsy();
  });

  it('dismisses only the reminders of this task', async () => {
    const reminders: TaskReminderLike[] = [
      taskReminder('r-task-1', 'task-1'),
      taskReminder('r-task-1-snoozed', 'task-1'),
      taskReminder('r-other-task', 'task-2'),
      otherReminder('r-lead-1', 'lead', 'task-1'),
      otherReminder('r-customer-1', 'customer', 'task-1'),
      { id: 'r-dismissed', entity_type: 'task', entity_id: 'task-1', is_dismissed: true },
    ];
    const deps = makeDeps({ reminders });

    const result = await completeTaskWithRecurrence({ id: 'task-1', is_recurring: false }, deps);

    expect(result.ok).toBe(true);
    expect(deps.dismissReminder).toHaveBeenCalledTimes(2);
    expect(deps.dismissReminder).toHaveBeenCalledWith('r-task-1');
    expect(deps.dismissReminder).toHaveBeenCalledWith('r-task-1-snoozed');
    expect(deps.dismissReminder).not.toHaveBeenCalledWith('r-other-task');
    expect(deps.dismissReminder).not.toHaveBeenCalledWith('r-lead-1');
    expect(deps.dismissReminder).not.toHaveBeenCalledWith('r-customer-1');
    expect(deps.dismissReminder).not.toHaveBeenCalledWith('r-dismissed');
    expect(result.dismissedReminderIds).toEqual(['r-task-1', 'r-task-1-snoozed']);
  });

  it('reports a rejected task update without throwing', async () => {
    const updateTask = vi.fn(async () => {
      throw new Error('network is down');
    });
    const deps = makeDeps({ updateTask });
    const onError = vi.fn();
    deps.onError = onError;

    const result = await completeTaskWithRecurrence({ id: 'task-1', is_recurring: true }, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('network is down');
    expect(onError).toHaveBeenCalledTimes(1);
    // The recurrence must not roll forward when the task was never closed.
    expect(deps.createNextRecurringInstance).not.toHaveBeenCalled();
    expect(deps.dismissReminder).not.toHaveBeenCalled();
  });

  it('reports a rejected task update as a cancelled task never happens', async () => {
    const updateTask = vi.fn(async () => {
      throw new Error('nope');
    });
    const deps = makeDeps({ updateTask });

    const result = await cancelTaskWithCleanup({ id: 'task-1' }, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nope');
  });
});

describe('cancelTaskWithCleanup', () => {
  it('cancels the task and never creates a next instance', async () => {
    const deps = makeDeps();

    const result = await cancelTaskWithCleanup({ id: 'task-1', is_recurring: true }, deps);

    expect(result.ok).toBe(true);
    expect(deps.updateTask).toHaveBeenCalledTimes(1);
    expect(deps.updateTask).toHaveBeenCalledWith('task-1', { status: 'Cancelled' });
    expect(deps.createNextRecurringInstance).not.toHaveBeenCalled();
    expect(result.createdNextInstance).toBeFalsy();
  });

  it('dismisses the reminders of the cancelled task only', async () => {
    const reminders: TaskReminderLike[] = [
      taskReminder('r-task-1', 'task-1'),
      taskReminder('r-task-2', 'task-2'),
      otherReminder('r-lead-1', 'lead', 'lead-9'),
    ];
    const deps = makeDeps({ reminders });

    const result = await cancelTaskWithCleanup({ id: 'task-1' }, deps);

    expect(result.ok).toBe(true);
    expect(deps.dismissReminder).toHaveBeenCalledTimes(1);
    expect(deps.dismissReminder).toHaveBeenCalledWith('r-task-1');
    expect(result.dismissedReminderIds).toEqual(['r-task-1']);
  });
});

describe('taskScopedReminderIds', () => {
  it('keeps only the active reminders of the given task', () => {
    const reminders: TaskReminderLike[] = [
      taskReminder('r-1', 'task-1'),
      taskReminder('r-2', 'task-1'),
      taskReminder('r-3', 'task-2'),
      otherReminder('r-4', 'lead', 'task-1'),
      { id: 'r-5', entity_type: 'task', entity_id: 'task-1', is_dismissed: true },
    ];

    expect(taskScopedReminderIds('task-1', reminders)).toEqual(['r-1', 'r-2']);
  });

  it('returns an empty list when there is no reminder list', () => {
    expect(taskScopedReminderIds('task-1')).toEqual([]);
    expect(taskScopedReminderIds('task-1', [])).toEqual([]);
  });
});
