import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { OUTCOME_OPTIONS, getRescheduleReasonSuggestions } from '@/constants/taskConstants';
import {
  buildFollowUpTaskPayload,
  cancelTaskWithCleanup,
  completeTaskWithRecurrence,
  createFollowUpTaskOnce,
  getDefaultFollowUpTaskTitle,
  getLeadCompletionLifecycleOptions,
  hasValidTaskReschedule,
  isLeadOnlyOpenNonRecurringTask,
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


describe('mobile task completion policy helpers', () => {
  const task = (overrides: Partial<{
    id: string;
    status: string;
    is_recurring: boolean;
    is_deleted: boolean;
    lead_id: string | null;
    related_entity_type: string | null;
    related_entity_id: string | null;
  }> = {}) => ({
    id: 'task-1',
    status: 'Pending',
    is_recurring: false,
    is_deleted: false,
    lead_id: 'lead-1',
    ...overrides,
  });

  it('requires a next step only for the lead’s sole active non-recurring task', () => {
    expect(isLeadOnlyOpenNonRecurringTask(task(), [task()], 'lead-1')).toBe(true);
    expect(isLeadOnlyOpenNonRecurringTask(task({ is_recurring: true }), [task({ is_recurring: true })], 'lead-1')).toBe(false);
    expect(isLeadOnlyOpenNonRecurringTask(task({ lead_id: null }), [task()], null)).toBe(false);

    const current = task();
    const another = task({ id: 'task-2', lead_id: null, related_entity_type: 'lead', related_entity_id: 'lead-1' });
    expect(isLeadOnlyOpenNonRecurringTask(current, [current, another], 'lead-1')).toBe(false);
  });

  it('ignores completed, cancelled and soft-deleted rows when checking another open task', () => {
    const current = task();
    const closed = task({ id: 'task-2', status: 'Completed' });
    const cancelled = task({ id: 'task-3', status: 'Cancelled' });
    const deleted = task({ id: 'task-4', is_deleted: true });
    expect(isLeadOnlyOpenNonRecurringTask(current, [current, closed, cancelled, deleted], 'lead-1')).toBe(true);
  });

  it('requires both a reschedule reason and a date', () => {
    expect(hasValidTaskReschedule('', '2026-11-28')).toBe(false);
    expect(hasValidTaskReschedule('   ', '2026-11-28')).toBe(false);
    expect(hasValidTaskReschedule('Client requested a callback', '')).toBe(false);
    expect(hasValidTaskReschedule(' Client requested a callback ', '2026-11-28')).toBe(true);
  });

  it('formats the suggested follow-up title from the task type label and person name', () => {
    expect(getDefaultFollowUpTaskTitle('Follow-up Call', ' Aarambh ')).toBe('Follow-up Call: Aarambh');
  });

  it('reuses the first created follow-up task id on a retry', async () => {
    const taskIdRef = { current: null as string | null };
    const createTask = vi.fn(async () => ({ id: 'follow-up-1' }));
    await expect(createFollowUpTaskOnce(taskIdRef, createTask)).resolves.toBe('follow-up-1');
    await expect(createFollowUpTaskOnce(taskIdRef, createTask)).resolves.toBe('follow-up-1');
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('builds a linked follow-up payload with full staff names and the configured values', () => {
    expect(buildFollowUpTaskPayload({
      title: ' Site Visit: Client Name ',
      type: 'Custom Task Type',
      assignedTo: 'Assigned Staff Full Name',
      createdBy: 'Signed-in Staff Full Name',
      dueDate: '2026-11-28',
      dueTime: '10:30',
      reminder: true,
      entityType: 'lead',
      entityId: 'lead-123',
    })).toEqual({
      title: 'Site Visit: Client Name',
      type: 'Custom Task Type',
      status: 'Pending',
      assigned_to: 'Assigned Staff Full Name',
      created_by: 'Signed-in Staff Full Name',
      due_date: '2026-11-28',
      due_time: '10:30',
      reminder: true,
      lead_id: 'lead-123',
      related_entity_type: 'lead',
      related_entity_id: 'lead-123',
      is_recurring: false,
    });
  });
});


describe('shared task completion options and lifecycle eligibility', () => {
  it('uses the canonical six desktop/mobile outcome values', () => {
    expect(OUTCOME_OPTIONS).toEqual([
      'Successful',
      'No Answer',
      'Call Back Later',
      'Not Interested',
      'Wrong Number',
      'Rescheduled by Client',
    ]);
  });

  it('returns outcome-specific reschedule suggestions and a safe default', () => {
    expect(getRescheduleReasonSuggestions('No Answer')).toEqual([
      'No phone answer',
      'Phone switched off',
      'Busy tone',
      'Went to voicemail',
    ]);
    expect(getRescheduleReasonSuggestions('Call Back Later')).toEqual([
      'Client requested callback',
      'Not available right now',
      'In a meeting',
      'Asked to call tomorrow',
    ]);
    expect(getRescheduleReasonSuggestions('Successful')).toEqual([
      'Follow-up required',
      'Client unavailable',
      'Timing not right',
    ]);
  });

  it('allows Convert and Mark Lost for an active, unconverted lead', () => {
    expect(getLeadCompletionLifecycleOptions({ status: 'in-progress' }, true)).toEqual({
      canConvertToCustomer: true,
      canMarkLost: true,
    });
  });

  it('does not infer conversion from manual won status alone', () => {
    expect(getLeadCompletionLifecycleOptions({
      status: 'won',
      is_converted: false,
      converted_to_customer_id: null,
    }, true)).toEqual({
      canConvertToCustomer: true,
      canMarkLost: true,
    });
  });

  it('hides Convert without leads.convert permission while preserving Mark Lost', () => {
    expect(getLeadCompletionLifecycleOptions({ status: 'new' }, false)).toEqual({
      canConvertToCustomer: false,
      canMarkLost: true,
    });
  });

  it('hides both lifecycle actions for an already-converted lead', () => {
    expect(getLeadCompletionLifecycleOptions({
      status: 'won',
      is_converted: true,
    }, true)).toEqual({
      canConvertToCustomer: false,
      canMarkLost: false,
    });
    expect(getLeadCompletionLifecycleOptions({
      status: 'won',
      converted_to_customer_id: 'customer-1',
    }, true)).toEqual({
      canConvertToCustomer: false,
      canMarkLost: false,
    });
  });

  it.each(['lost', 'pending_lost'])('does not offer Mark Lost for status %s', (status) => {
    expect(getLeadCompletionLifecycleOptions({ status }, true)).toEqual({
      canConvertToCustomer: true,
      canMarkLost: false,
    });
  });

  it('hides both lifecycle actions for a deleted or missing lead', () => {
    expect(getLeadCompletionLifecycleOptions({ status: 'deleted' }, true)).toEqual({
      canConvertToCustomer: false,
      canMarkLost: false,
    });
    expect(getLeadCompletionLifecycleOptions(null, true)).toEqual({
      canConvertToCustomer: false,
      canMarkLost: false,
    });
  });
});

describe('Desktop and Mobile completion parity', () => {
  const desktopSource = readFileSync(
    new URL('../../components/tasks/TaskCompletionDialog.tsx', import.meta.url),
    'utf8',
  );
  const mobileSource = readFileSync(
    new URL('../screens/DailyWorkScreens.tsx', import.meta.url),
    'utf8',
  );

  it('uses the shared six-outcome fallback and reason suggestions on Desktop and Mobile', () => {
    expect(desktopSource).toContain('OUTCOME_OPTIONS');
    expect(desktopSource).toContain('getRescheduleReasonSuggestions');
    expect(mobileSource).toContain('OUTCOME_OPTIONS');
    expect(mobileSource).toContain('getRescheduleReasonSuggestions');
    expect(mobileSource).toContain('() => OUTCOME_OPTIONS.map((value) => ({ value, label: value }))');
  });

  it('requires a non-blank reason on both mobile reschedule entry points', () => {
    expect(mobileSource).toContain('hasValidTaskReschedule(rescheduleReason, dateStr)');
    expect(mobileSource).toContain('Reschedule Reason *');
    expect(mobileSource).toContain('getRescheduleReasonSuggestions(outcome)');
  });

  it('keeps all managed mobile options live from Control Panel', () => {
    const leadSource = readFileSync(new URL('../screens/LeadScreens.tsx', import.meta.url), 'utf8');
    const peopleSource = readFileSync(new URL('../screens/PeopleScreens.tsx', import.meta.url), 'utf8');
    const quickAddSource = readFileSync(new URL('../shell/MobileShell.tsx', import.meta.url), 'utf8');

    for (const field of ['designation', 'construction_stage', 'source', 'priority', 'lost_reason']) {
      expect(leadSource).toContain(`getFieldOptions('leads', '${field}')`);
    }
    expect(leadSource).toContain(`getFieldOptions('materials', 'materials')`);
    expect(leadSource).toContain('materialOptions.find((option) => option.isDefault)');
    expect(leadSource).toContain('priorityOptions.find((o) => o.isDefault)');
    expect(peopleSource).toContain(`getFieldOptions('professionals', 'professional_type')`);
    expect(peopleSource).toContain(`getFieldOptions('materials', 'materials')`);
    expect(quickAddSource).toContain(`getFieldOptions('tasks', 'type')`);
    expect(quickAddSource).toContain('find((option) => option.isDefault)');
    expect(quickAddSource).not.toContain('FALLBACK_TASK_TYPES');
    expect(mobileSource).toContain('control.taskTypes');
    expect(mobileSource).toContain('taskTypeOptions.find((option) => option.isDefault)');
  });

  it('uses task INSERT and update reminder sync without duplicate reminder writes', () => {
    const useTasksSource = readFileSync(new URL('../../hooks/useTasks.ts', import.meta.url), 'utf8');
    expect(mobileSource).toContain('createFollowUpTaskOnce(followUpTaskIdRef');
    expect(mobileSource).toContain('buildFollowUpTaskPayload');
    expect(useTasksSource).toContain('.insert([taskData])');
    expect(useTasksSource).toContain('void syncTaskReminder(data)');
    expect(mobileSource).not.toContain("functions.invoke('run-automations'");
    expect(mobileSource).not.toContain('addReminder(');
    expect(mobileSource).not.toContain('deleteReminder(');
    expect(mobileSource).toContain('useTasks.updateTask owns the canonical task-scoped reminder mirror');
    expect(mobileSource).toContain('completion_status: completionStatus');
    expect(mobileSource).toContain('attempt_count: attemptCount');
    expect(mobileSource).toContain('updates.closed_at = nowIso');
    expect(mobileSource).toContain("steps.add('followup_parent_activity')");
  });

  it('respects system reminder defaults for new work and the stored reminder for an existing task', () => {
    const quickAddSource = readFileSync(new URL('../shell/MobileShell.tsx', import.meta.url), 'utf8');
    const leadSource = readFileSync(new URL('../screens/LeadScreens.tsx', import.meta.url), 'utf8');
    expect(mobileSource).toContain('setReminderOn(task.reminder_enabled)');
    expect(mobileSource).toContain('init.targetTask.reminder ?? init.defaultRemindersEnabled');
    expect(mobileSource).toContain('targetTaskReminder ?? defaultRemindersEnabled');
    expect(quickAddSource).toContain('useState(defaultRemindersEnabled)');
    expect(quickAddSource).toContain('setReminderEnabled(defaultRemindersEnabled)');
    expect(leadSource).toContain('useState(defaultRemindersEnabled)');
    expect(leadSource).toContain('setReminderEnabled(defaultRemindersEnabled)');
  });

  it('does not invent a Lead priority default before the Control Panel loads', () => {
    const leadSource = readFileSync(new URL('../screens/LeadScreens.tsx', import.meta.url), 'utf8');
    expect(leadSource).toContain('useState(Number.NaN)');
    expect(leadSource).toContain('Select a priority configured in Control Panel');
    expect(leadSource).not.toContain('setPriority(3)');
  });

  it('keeps reason chips at 44px minimum and the Call Log search input at 16px', () => {
    expect(mobileSource).not.toContain('min-h-[36px]');
    expect(mobileSource).toContain('min-h-[44px]');
    const appSource = readFileSync(new URL('../MobileApp.tsx', import.meta.url), 'utf8');
    const searchStart = appSource.indexOf('type="search"');
    expect(searchStart).toBeGreaterThanOrEqual(0);
    expect(appSource.slice(searchStart, searchStart + 500)).toContain('text-base');
  });
});
