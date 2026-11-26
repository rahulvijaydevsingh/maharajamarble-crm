import { describe, expect, it } from 'vitest';

import {
  filterActiveTasks,
  filterCancelledTasks,
  getTaskUrgency,
  isTaskActiveAndNotOrphan,
  isTaskCancelledForBin,
  sortTasksByUrgency,
  taskEntityKind,
  taskTypeLabel,
} from '@/mobile/lib/tasks';
import type { CrmTask } from '@/mobile/types/crmTypes';

const BASE: Omit<
  CrmTask,
  'id' | 'lead_id' | 'lead' | 'customer_id' | 'professional_id' | 'is_deleted'
> = {
  title: 'Sample task',
  task_type: 'Follow-up Call',
  due_at: new Date().toISOString(),
  status: 'Pending',
  is_recurring: false,
  reminder_enabled: true,
  assigned_to: 'Test Staff Member',
  created_by: 'Test Staff Member',
  updated_by: 'Test Staff Member',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('orphan-safe task filter', () => {
  it('keeps a Customer task (lead_id === null)', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-cust',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(true);
  });

  it('keeps a Professional task (lead_id === null)', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-pro',
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: 'prof-1',
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(true);
  });

  it('keeps a plain lead task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-lead',
      lead_id: 'lead-1',
      lead: {
        id: 'lead-1',
        full_name: 'Test Customer',
        phone: '9829112233',
        status: 'new',
      },
      customer_id: null,
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(true);
  });

  it('excludes an orphaned task whose lead no longer resolves', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-orphan',
      lead_id: 'lead-deleted',
      lead: null,
      customer_id: null,
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(false);
  });

  it('excludes a soft-deleted task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-del',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
      is_deleted: true,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(false);
  });

  it('excludes a cancelled task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-cancelled',
      status: 'Cancelled',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(false);
  });

  it('excludes a task whose parent lead is deleted', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't-lead-deleted',
      lead_id: 'lead-1',
      lead: {
        id: 'lead-1',
        full_name: 'Test Customer',
        phone: '9829112233',
        status: 'deleted',
      },
      customer_id: null,
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(false);
  });

  it('filters a mixed list without losing customer or professional tasks', () => {
    const tasks: CrmTask[] = [
      {
        ...BASE,
        id: 'keep-cust',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
      },
      {
        ...BASE,
        id: 'keep-pro',
        lead_id: null,
        lead: null,
        customer_id: null,
        professional_id: 'prof-1',
      },
      {
        ...BASE,
        id: 'drop-orphan',
        lead_id: 'lead-x',
        lead: null,
        customer_id: null,
        professional_id: null,
      },
      {
        ...BASE,
        id: 'drop-deleted',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
        is_deleted: true,
      },
    ];
    expect(filterActiveTasks(tasks).map((task) => task.id)).toEqual([
      'keep-cust',
      'keep-pro',
    ]);
  });
});

describe('cancelled task bin', () => {
  const base = {
    title: 'Sample task',
    task_type: 'Follow-up Call',
    due_at: new Date().toISOString(),
    status: 'Cancelled',
    is_recurring: false,
    reminder_enabled: true,
    assigned_to: 'Test Staff Member',
    created_by: 'Test Staff Member',
    updated_by: 'Test Staff Member',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Omit<
    CrmTask,
    'id' | 'lead_id' | 'lead' | 'customer_id' | 'professional_id' | 'is_deleted'
  >;

  it('lists a cancelled task even though the orphan-safe filter excludes it', () => {
    const task: CrmTask = {
      ...base,
      id: 't-cancelled',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
    };
    expect(isTaskActiveAndNotOrphan(task)).toBe(false);
    expect(isTaskCancelledForBin(task)).toBe(true);
  });

  it('does not list a soft-deleted task in the cancelled view', () => {
    const task: CrmTask = {
      ...base,
      id: 't-cancelled-deleted',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
      is_deleted: true,
    };
    expect(isTaskCancelledForBin(task)).toBe(false);
  });

  it('does not list an active task in the cancelled view', () => {
    const task: CrmTask = {
      ...base,
      id: 't-active',
      status: 'Pending',
      lead_id: null,
      lead: null,
      customer_id: 'cust-1',
      professional_id: null,
    };
    expect(isTaskCancelledForBin(task)).toBe(false);
  });

  it('filters a mixed list', () => {
    const tasks: CrmTask[] = [
      {
        ...base,
        id: 'cancelled',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
      },
      {
        ...base,
        id: 'active',
        status: 'Pending',
        lead_id: null,
        lead: null,
        customer_id: 'cust-1',
        professional_id: null,
      },
    ];
    expect(filterCancelledTasks(tasks).map((task) => task.id)).toEqual(['cancelled']);
  });
});

describe('task urgency', () => {
  const now = new Date('2026-11-21T12:00:00.000Z').getTime();

  it('classifies an overdue task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't',
      due_at: '2026-11-20T10:00:00.000Z',
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    };
    expect(getTaskUrgency(task, now)).toBe('overdue');
  });

  it('classifies a completed task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't',
      status: 'Completed',
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    };
    expect(getTaskUrgency(task, now)).toBe('completed');
  });

  it('classifies a cancelled task', () => {
    const task: CrmTask = {
      ...BASE,
      id: 't',
      status: 'Cancelled',
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    };
    expect(getTaskUrgency(task, now)).toBe('cancelled');
  });

  it('sorts overdue tasks first', () => {
    const make = (id: string, dueAt: string): CrmTask => ({
      ...BASE,
      id,
      due_at: dueAt,
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    });
    const sorted = sortTasksByUrgency(
      [
        make('later', '2026-12-01T10:00:00.000Z'),
        make('overdue', '2026-11-19T10:00:00.000Z'),
        make('soon', '2026-11-22T10:00:00.000Z'),
      ],
      now,
    );
    expect(sorted.map((task) => task.id)).toEqual(['overdue', 'soon', 'later']);
  });

  it('never throws on an unparseable due date', () => {
    const make = (id: string, dueAt: string): CrmTask => ({
      ...BASE,
      id,
      due_at: dueAt,
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    });

    let sorted: CrmTask[] = [];
    expect(() => {
      sorted = sortTasksByUrgency(
        [make('broken', 'not-a-date'), make('valid', '2026-12-01T10:00:00.000Z')],
        now,
      );
    }).not.toThrow();
    expect(sorted).toHaveLength(2);
  });

  it('keeps an invalid date behind every dated task', () => {
    const make = (id: string, dueAt: string): CrmTask => ({
      ...BASE,
      id,
      due_at: dueAt,
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    });

    const sorted = sortTasksByUrgency(
      [make('broken', 'not-a-date'), make('valid', '2026-12-01T10:00:00.000Z')],
      now,
    );
    expect(sorted.map((task) => task.id)).toEqual(['valid', 'broken']);
  });

  it('keeps a task without a due date at the end of the list', () => {
    const make = (id: string, dueAt: string): CrmTask => ({
      ...BASE,
      id,
      due_at: dueAt,
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    });

    const sorted = sortTasksByUrgency(
      [make('none', ''), make('dated', '2026-12-01T10:00:00.000Z')],
      now,
    );
    expect(sorted.map((task) => task.id)).toEqual(['dated', 'none']);
  });
});

describe('task helpers', () => {
  it('uses the Control Panel label when one is supplied', () => {
    expect(taskTypeLabel('Follow-up Call', { 'Follow-up Call': 'Follow-up Call (Web)' })).toBe(
      'Follow-up Call (Web)',
    );
    expect(taskTypeLabel('Follow-up Call')).toBe('Follow-up Call');
    expect(taskTypeLabel(undefined)).toBe('Task');
  });

  it('resolves the entity a task belongs to', () => {
    const base: CrmTask = {
      ...BASE,
      id: 't',
      lead_id: null,
      lead: null,
      customer_id: null,
      professional_id: null,
    };
    expect(taskEntityKind({ ...base, lead_id: 'lead-1' })).toBe('lead');
    expect(taskEntityKind({ ...base, customer_id: 'cust-1' })).toBe('customer');
    expect(taskEntityKind({ ...base, professional_id: 'prof-1' })).toBe('professional');
    expect(taskEntityKind({ ...base, related_entity_type: 'customer' })).toBe('customer');
    expect(taskEntityKind(base)).toBeNull();
  });
});
