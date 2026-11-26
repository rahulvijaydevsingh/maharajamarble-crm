import { describe, expect, it } from 'vitest';

import {
  DESKTOP_HANDOFF_ROLES,
  HANDOFF_ROW_SPECS,
  buildHandoffRows,
  handoffPermissionStrings,
  isDesktopHandoffRole,
} from '@/mobile/lib/roleGating';
import { FULL_CRM_TARGETS, resolveFullCrmTarget } from '@/mobile/routing/handoffHelper';

const ALL_PERMISSIONS = [
  'tasks.create',
  'quotations.create',
  'leads.create',
  'customers.create',
  'professionals.create',
  'customers.manage_attachments',
];

function stateFor(role: string | null, permissions: string[]) {
  return {
    role,
    hasPermission: (permission: string) => permissions.includes(permission),
    canAccessControlPanel: () => permissions.includes('control_panel.view'),
    canManageRoles: () => permissions.includes('roles.manage'),
  };
}

describe('desktop handoff role whitelist', () => {
  it('allows only super_admin, admin and manager', () => {
    expect(DESKTOP_HANDOFF_ROLES).toEqual(['super_admin', 'admin', 'manager']);
    expect(isDesktopHandoffRole('super_admin')).toBe(true);
    expect(isDesktopHandoffRole('admin')).toBe(true);
    expect(isDesktopHandoffRole('manager')).toBe(true);
  });

  it('rejects field agents, office staff and unknown roles', () => {
    expect(isDesktopHandoffRole('field_agent')).toBe(false);
    expect(isDesktopHandoffRole('sales_user')).toBe(false);
    expect(isDesktopHandoffRole('sales_viewer')).toBe(false);
    expect(isDesktopHandoffRole(null)).toBe(false);
    expect(isDesktopHandoffRole(undefined)).toBe(false);
  });
});

describe('more hub role gating', () => {
  it('shows nothing at all to a field agent', () => {
    const rows = buildHandoffRows(stateFor('field_agent', ALL_PERMISSIONS));
    expect(rows).toHaveLength(0);
  });

  it('shows nothing at all to a sales user', () => {
    expect(buildHandoffRows(stateFor('sales_user', ALL_PERMISSIONS))).toHaveLength(0);
  });

  it('shows the permission-gated rows to a manager', () => {
    const rows = buildHandoffRows(stateFor('manager', ALL_PERMISSIONS));
    const keys = rows.map((row) => row.key);
    expect(keys).toContain('calendar');
    expect(keys).toContain('leads-new');
    expect(keys).toContain('customers-new');
    expect(keys).toContain('professionals-new');
    expect(keys).toContain('quotations');
    expect(keys).toContain('customer-attachments');
  });

  it('hides the admin-only rows from a manager', () => {
    const rows = buildHandoffRows(stateFor('manager', ALL_PERMISSIONS));
    const keys = rows.map((row) => row.key);
    expect(keys).not.toContain('control-panel');
    expect(keys).not.toContain('roles');
    expect(keys).not.toContain('automation');
    expect(keys).not.toContain('api-docs');
    expect(keys).not.toContain('performance');
    expect(keys).not.toContain('backup');
  });

  it('shows the admin-only rows to an administrator', () => {
    const rows = buildHandoffRows(
      stateFor('admin', [...ALL_PERMISSIONS, 'control_panel.view', 'roles.manage']),
    );
    const keys = rows.map((row) => row.key);
    expect(keys).toContain('control-panel');
    expect(keys).toContain('roles');
    expect(keys).toContain('automation');
    expect(keys).toContain('api-docs');
    expect(keys).toContain('performance');
    expect(keys).toContain('backup');
  });

  it('hides a row whose permission is missing', () => {
    const rows = buildHandoffRows(stateFor('manager', ['tasks.create']));
    const keys = rows.map((row) => row.key);
    expect(keys).toContain('calendar');
    expect(keys).not.toContain('quotations');
    expect(keys).not.toContain('customers-new');
  });

  it('keeps a stable order', () => {
    const first = buildHandoffRows(stateFor('admin', [...ALL_PERMISSIONS, 'control_panel.view', 'roles.manage'])).map(
      (row) => row.key,
    );
    const second = buildHandoffRows(stateFor('admin', [...ALL_PERMISSIONS, 'control_panel.view', 'roles.manage'])).map(
      (row) => row.key,
    );
    expect(first).toEqual(second);
  });

  it('gives every spec a key, a label and a target code', () => {
    HANDOFF_ROW_SPECS.forEach((spec) => {
      expect(spec.key.length).toBeGreaterThan(0);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.targetCode.length).toBeGreaterThan(0);
    });
  });

  it('uses canonical named target codes — never a raw path', () => {
    const codeFor = (key: string) =>
      HANDOFF_ROW_SPECS.find((spec) => spec.key === key)?.targetCode;

    expect(codeFor('control-panel')).toBe('settings');
    expect(codeFor('roles')).toBe('settings');
    expect(codeFor('backup')).toBe('settings');
    expect(codeFor('automation')).toBe('automation');
    expect(codeFor('api-docs')).toBe('api-docs');
    expect(codeFor('performance')).toBe('performance');

    // The existing named codes stay as they are.
    expect(codeFor('calendar')).toBe('calendar');
    expect(codeFor('todo-lists')).toBe('todo-lists');
    expect(codeFor('quotations')).toBe('quotations');
    expect(codeFor('leads-new')).toBe('leads/new');
    expect(codeFor('customers-new')).toBe('customers/new');
    expect(codeFor('professionals-new')).toBe('professionals/new');
    expect(codeFor('customer-attachments')).toBe('customers');
  });

  it('resolves every row to a known full CRM target', () => {
    HANDOFF_ROW_SPECS.forEach((spec) => {
      expect(spec.targetCode.startsWith('/')).toBe(false);
      // An unknown code would silently fall back to the CRM root.
      expect(resolveFullCrmTarget(spec.targetCode)).not.toEqual(FULL_CRM_TARGETS.workspace);
    });
  });

  it('lists the permission strings the matrix depends on', () => {
    const permissions = handoffPermissionStrings();
    expect(permissions).toContain('leads.create');
    expect(permissions).toContain('customers.manage_attachments');
    expect(permissions).toContain('quotations.create');
  });
});
