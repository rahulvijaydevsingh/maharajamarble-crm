import { describe, expect, it, vi } from 'vitest';

import {
  LEAD_CREATE_STEPS,
  buildFirstFollowUpReminderTitle,
  buildFirstFollowUpTaskTitle,
  describeFailedSteps,
  retryLeadCreateEffects,
  runLeadCreateEffects,
  shouldSendAssigneeNotification,
  type LeadCreateEffectsDeps,
  type LeadCreateEffectsInput,
  type LeadCreateNotificationPayload,
  type LeadCreateReminderPayload,
  type LeadCreateTaskPayload,
  type LeadCreateToastMessage,
} from '@/mobile/lib/leadCreateEffects';
import { toLeadInsert } from '@/mobile/lib/mappers';

/** The order every effect has to run in. */
const STEP_ORDER = ['professionals', 'referral', 'follow_up_task', 'reminder', 'notification'];

function baseInput(overrides: Partial<LeadCreateEffectsInput> = {}): LeadCreateEffectsInput {
  return {
    leadId: 'lead-1',
    leadName: 'Riya Sharma',
    assignedTo: 'Vijay Kumar',
    assignedToEmail: 'vijay.kumar@example.com',
    actorName: 'Meera Sharma',
    dueDate: '2026-11-27',
    dueTime: '10:30',
    reminderEnabled: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<LeadCreateEffectsDeps> = {}) {
  const calls: string[] = [];
  const tasks: LeadCreateTaskPayload[] = [];
  const reminders: LeadCreateReminderPayload[] = [];
  const notifications: LeadCreateNotificationPayload[] = [];
  const toasts: LeadCreateToastMessage[] = [];

  const deps: LeadCreateEffectsDeps = {
    addLead: vi.fn(async () => ({ id: 'lead-1' })),
    syncProfessionals: vi.fn(async () => {
      calls.push('professionals');
    }),
    linkReferral: vi.fn(async () => {
      calls.push('referral');
    }),
    addTask: vi.fn(async (task: LeadCreateTaskPayload) => {
      calls.push('follow_up_task');
      tasks.push(task);
      return { id: 'task-1' };
    }),
    addReminder: vi.fn(async (reminder: LeadCreateReminderPayload) => {
      calls.push('reminder');
      reminders.push(reminder);
    }),
    notifyAssignee: vi.fn(async (notification: LeadCreateNotificationPayload) => {
      calls.push('notification');
      notifications.push(notification);
    }),
    toast: vi.fn((message: LeadCreateToastMessage) => {
      toasts.push(message);
    }),
    ...overrides,
  };

  return { deps, calls, tasks, reminders, notifications, toasts };
}

describe('runLeadCreateEffects', () => {
  it('runs the desktop steps in the exact desktop order', async () => {
    const { deps, calls } = makeDeps();

    const result = await runLeadCreateEffects(baseInput(), deps);

    expect(calls).toEqual(STEP_ORDER);
    expect(result.completedSteps).toEqual(STEP_ORDER);
    expect(result.failedSteps).toEqual([]);
    expect(result.leadId).toBe('lead-1');
  });

  it('declares the same step order as the desktop flow', () => {
    expect([...LEAD_CREATE_STEPS]).toEqual(STEP_ORDER);
  });

  it('creates the "First Follow-up" task of type "Follow-up Call"', async () => {
    const { deps, tasks } = makeDeps();

    await runLeadCreateEffects(baseInput(), deps);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'First Follow-up: Riya Sharma',
      type: 'Follow-up Call',
      status: 'Pending',
      due_date: '2026-11-27',
      due_time: '10:30',
      lead_id: 'lead-1',
      // INVARIANT-04 — staff full names, never an email or a UUID.
      assigned_to: 'Vijay Kumar',
      created_by: 'Meera Sharma',
      reminder: true,
    });
  });

  it('creates the task-scoped reminder when the alarm is enabled', async () => {
    const { deps, reminders } = makeDeps();

    const result = await runLeadCreateEffects(baseInput({ reminderEnabled: true }), deps);

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      title: buildFirstFollowUpReminderTitle('Riya Sharma'),
      entity_type: 'task',
      entity_id: 'task-1',
      assigned_to: 'Vijay Kumar',
    });
    expect(result.createdTaskId).toBe('task-1');
  });

  it('creates NO reminder when the alarm is unchecked', async () => {
    const { deps, reminders, calls } = makeDeps();

    await runLeadCreateEffects(baseInput({ reminderEnabled: false }), deps);

    expect(reminders).toHaveLength(0);
    expect(calls).not.toContain('reminder');
  });

  it('notifies the assignee when the task is assigned to somebody else', async () => {
    const { deps, notifications } = makeDeps();

    await runLeadCreateEffects(baseInput(), deps);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      user_id: 'vijay.kumar@example.com',
      type: 'lead_assigned',
      entity_type: 'lead',
      entity_id: 'lead-1',
    });
  });

  it('does NOT notify the assignee when the signed-in actor is the assignee', async () => {
    const { deps, notifications } = makeDeps();

    await runLeadCreateEffects(
      baseInput({ assignedTo: 'Meera Sharma', actorName: 'Meera Sharma' }),
      deps,
    );

    expect(notifications).toHaveLength(0);
  });

  it('keeps the lead and names the failed step when a step throws', async () => {
    const { deps, toasts } = makeDeps({
      addTask: vi.fn(async () => {
        throw new Error('task insert rejected');
      }),
    });

    const result = await runLeadCreateEffects(baseInput(), deps);

    expect(result.failedSteps).toEqual(['follow_up_task']);
    expect(result.errors.follow_up_task).toContain('task insert rejected');
    // The other steps still ran — the lead was saved, so every effect is
    // still worth trying.
    expect(result.completedSteps).toEqual(['professionals', 'referral', 'reminder', 'notification']);
    expect(toasts).toHaveLength(1);
    expect(String(toasts[0].title)).toContain('follow-up task');
  });

  it('retries ONLY the failed step and never creates a second lead', async () => {
    const addLead = vi.fn(async () => ({ id: 'lead-1' }));
    let failTask = true;
    const { deps, calls } = makeDeps();
    deps.addLead = addLead;
    deps.addTask = vi.fn(async (task: LeadCreateTaskPayload) => {
      calls.push('follow_up_task');
      if (failTask) throw new Error('network is down');
      return { id: 'task-1' };
    });

    const first = await runLeadCreateEffects(baseInput(), deps);
    expect(first.failedSteps).toEqual(['follow_up_task']);

    failTask = false;
    const callsBeforeRetry = calls.length;
    const retry = await retryLeadCreateEffects(baseInput(), deps, first.failedSteps);

    expect(retry.failedSteps).toEqual([]);
    expect(retry.completedSteps).toEqual(['follow_up_task']);
    // The retry only ran the failed step …
    expect(calls.slice(callsBeforeRetry)).toEqual(['follow_up_task']);
    // … and the lead was never re-created.
    expect(addLead).not.toHaveBeenCalled();
  });

  it('ignores an unknown step name on a retry', async () => {
    const { deps, calls } = makeDeps();

    const retry = await retryLeadCreateEffects(baseInput(), deps, ['not_a_step']);

    expect(retry.completedSteps).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('leadCreateEffects helpers', () => {
  it('names the failed steps for the toast', () => {
    expect(describeFailedSteps(['follow_up_task'])).toBe('follow-up task');
    expect(describeFailedSteps(['reminder', 'notification'])).toBe('reminder, assignee notification');
  });

  it('only notifies when the assignee is somebody else AND has an email', () => {
    expect(shouldSendAssigneeNotification(baseInput())).toBe(true);
    expect(
      shouldSendAssigneeNotification(baseInput({ assignedTo: 'Meera Sharma', actorName: 'Meera Sharma' })),
    ).toBe(false);
    expect(shouldSendAssigneeNotification(baseInput({ assignedToEmail: null }))).toBe(false);
    expect(shouldSendAssigneeNotification(baseInput({ assignedTo: '' }))).toBe(false);
  });

  it('builds the desktop task title', () => {
    expect(buildFirstFollowUpTaskTitle('Riya Sharma')).toBe('First Follow-up: Riya Sharma');
  });
});

describe('the follow-up date is owned by the database trigger', () => {
  it('never writes next_follow_up into the lead payload', () => {
    const payload = toLeadInsert(
      {
        full_name: 'Riya Sharma',
        phone: '9829112233',
        designation: 'owner',
        site_location: 'Civil Lines, Jaipur',
        material_interests: [],
        construction_stage: 'flooring_ready',
        lead_source: 'walk_in',
        priority: 3,
        next_action_at: '2026-11-27T10:30:00.000Z',
        reminder_enabled: true,
      },
      'Vijay Kumar',
      'Meera Sharma',
    );

    expect('next_follow_up' in payload).toBe(false);
    expect('last_follow_up' in payload).toBe(false);
  });
});
