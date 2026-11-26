import { describe, expect, it } from 'vitest';

import {
  canUseTaskScopeToggle,
  filterTasksByScope,
  type TaskScope,
} from '@/mobile/lib/tasks';
import type { CrmTask } from '@/mobile/types/crmTypes';

function makeTask(overrides: Partial<CrmTask> = {}): CrmTask {
  return {
    id: 'task-1',
    title: 'Follow up call',
    task_type: 'Follow-up Call',
    due_at: '2026-01-05T09:00:00.000Z',
    status: 'Pending',
    is_recurring: false,
    reminder_enabled: true,
    lead_id: null,
    customer_id: null,
    professional_id: null,
    assigned_to: 'Asha Menon',
    created_by: 'Asha Menon',
    updated_by: 'Asha Menon',
    created_at: '2026-01-01T09:00:00.000Z',
    updated_at: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

const TASKS: CrmTask[] = [
  makeTask({ id: 'task-1', assigned_to: 'Asha Menon' }),
  makeTask({ id: 'task-2', assigned_to: 'Ravi Kumar' }),
  makeTask({ id: 'task-3', assigned_to: 'Asha Menon' }),
];

describe('filterTasksByScope', () => {
  it('keeps only the tasks of the signed-in staff member for "mine"', () => {
    const result = filterTasksByScope(TASKS, 'mine', 'Asha Menon');

    expect(result.map((task) => task.id)).toEqual(['task-1', 'task-3']);
  });

  it('matches the assignee name case-insensitively', () => {
    const result = filterTasksByScope(TASKS, 'mine', 'asha menon');

    expect(result.map((task) => task.id)).toEqual(['task-1', 'task-3']);
  });

  it('trims the signed-in name and the stored assignee', () => {
    const tasks = [makeTask({ id: 'task-9', assigned_to: '  Asha Menon  ' })];

    expect(filterTasksByScope(tasks, 'mine', '  Asha Menon ')).toHaveLength(1);
    expect(filterTasksByScope(tasks, 'mine', 'Asha Menon')).toHaveLength(1);
  });

  it('returns an empty list when the signed-in name is missing', () => {
    expect(filterTasksByScope(TASKS, 'mine', null)).toEqual([]);
    expect(filterTasksByScope(TASKS, 'mine', undefined)).toEqual([]);
    expect(filterTasksByScope(TASKS, 'mine', '')).toEqual([]);
    expect(filterTasksByScope(TASKS, 'mine', '   ')).toEqual([]);
  });

  it('returns every task for "team"', () => {
    const result = filterTasksByScope(TASKS, 'team', 'Asha Menon');

    expect(result).toHaveLength(3);
    expect(result.map((task) => task.id)).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('returns every task for "team" even without a signed-in name', () => {
    expect(filterTasksByScope(TASKS, 'team')).toHaveLength(3);
  });

  it('never returns anything for a non-array input', () => {
    expect(filterTasksByScope(undefined as unknown as CrmTask[], 'mine', 'Asha Menon')).toEqual([]);
    expect(filterTasksByScope(undefined as unknown as CrmTask[], 'team')).toEqual([]);
  });
});

describe('canUseTaskScopeToggle', () => {
  it('is available for the roles that reach the desktop workspace', () => {
    expect(canUseTaskScopeToggle('super_admin')).toBe(true);
    expect(canUseTaskScopeToggle('admin')).toBe(true);
    expect(canUseTaskScopeToggle('manager')).toBe(true);
  });

  it('is hidden for every other role', () => {
    expect(canUseTaskScopeToggle('sales_user')).toBe(false);
    expect(canUseTaskScopeToggle('sales_viewer')).toBe(false);
    expect(canUseTaskScopeToggle('field_agent')).toBe(false);
    expect(canUseTaskScopeToggle('unknown_role')).toBe(false);
    expect(canUseTaskScopeToggle(null)).toBe(false);
    expect(canUseTaskScopeToggle(undefined)).toBe(false);
    expect(canUseTaskScopeToggle('')).toBe(false);
  });

  it('defaults to the "mine" scope', () => {
    const defaultScope: TaskScope = 'mine';
    expect(defaultScope).toBe('mine');
  });
});
