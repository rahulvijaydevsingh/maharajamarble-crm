/**
 * Role gating for the mobile `More` hub.
 *
 * The full CRM desktop workspace exposes surfaces that only administrators and
 * managers should reach (Control Panel, Roles, Automations, API docs). The
 * mobile hub links out to those surfaces, so the same rules have to be
 * enforced here — a field agent must never see an admin-only link.
 *
 * The decision table lives in this module (not inside a screen) so it can be
 * unit tested and so there is exactly one definition of "who may see what".
 */

/** Roles that may see desktop-only handoffs at all. */
export const DESKTOP_HANDOFF_ROLES = ['super_admin', 'admin', 'manager'] as const;

export type DesktopHandoffRole = (typeof DESKTOP_HANDOFF_ROLES)[number];

/** How a row is gated. */
export type HandoffGate =
  /** A plain permission string from `usePermissions().hasPermission`. */
  | 'permission'
  /** `usePermissions().canAccessControlPanel()`. */
  | 'control_panel'
  /** `usePermissions().canManageRoles()`. */
  | 'manage_roles';

export interface HandoffRowSpec {
  /** Stable key — the screen maps this to an icon. */
  key: string;
  label: string;
  /** Canonical target code understood by `resolveFullCrmTarget` — never a raw path. */
  targetCode: string;
  gate: HandoffGate;
  /** Required when `gate` is `permission`. */
  permission?: string;
}

/** The full handoff matrix, in render order. */
export const HANDOFF_ROW_SPECS: HandoffRowSpec[] = [
  { key: 'calendar', label: 'Calendar', targetCode: 'calendar', gate: 'permission', permission: 'tasks.create' },
  { key: 'todo-lists', label: 'To-Do Lists', targetCode: 'todo-lists', gate: 'permission', permission: 'tasks.create' },
  { key: 'quotations', label: 'Quotations', targetCode: 'quotations', gate: 'permission', permission: 'quotations.create' },
  { key: 'leads-new', label: 'New Lead (Full CRM)', targetCode: 'leads/new', gate: 'permission', permission: 'leads.create' },
  { key: 'customers-new', label: 'New Customer (Full CRM)', targetCode: 'customers/new', gate: 'permission', permission: 'customers.create' },
  { key: 'professionals-new', label: 'New Professional (Full CRM)', targetCode: 'professionals/new', gate: 'permission', permission: 'professionals.create' },
  { key: 'customer-attachments', label: 'Customer Attachments', targetCode: 'customers', gate: 'permission', permission: 'customers.manage_attachments' },
  { key: 'control-panel', label: 'Control Panel', targetCode: 'settings', gate: 'control_panel' },
  { key: 'roles', label: 'Roles & Permissions', targetCode: 'settings', gate: 'manage_roles' },
  { key: 'backup', label: 'Backup & Restore', targetCode: 'settings', gate: 'control_panel' },
  { key: 'automation', label: 'Automation Rules', targetCode: 'automation', gate: 'control_panel' },
  { key: 'api-docs', label: 'API Access', targetCode: 'api-docs', gate: 'control_panel' },
  { key: 'performance', label: 'Performance Reports', targetCode: 'performance', gate: 'control_panel' },
];

export interface HandoffPermissionState {
  /** The live role from `usePermissions().role`. */
  role?: string | null;
  /** `usePermissions().hasPermission`. */
  hasPermission: (permission: string) => boolean;
  /** `usePermissions().canAccessControlPanel`. */
  canAccessControlPanel: () => boolean;
  /** `usePermissions().canManageRoles`. */
  canManageRoles: () => boolean;
}

/** True when the role is allowed to see any desktop-only handoff. */
export function isDesktopHandoffRole(role?: string | null): boolean {
  if (!role) return false;
  return (DESKTOP_HANDOFF_ROLES as readonly string[]).includes(role);
}

/**
 * Returns the handoff rows the current role may see.
 *
 * A role outside {@link DESKTOP_HANDOFF_ROLES} sees nothing at all; otherwise
 * each row is granted by its own permission check.
 */
export function buildHandoffRows(state: HandoffPermissionState): HandoffRowSpec[] {
  if (!isDesktopHandoffRole(state.role)) return [];

  return HANDOFF_ROW_SPECS.filter((spec) => {
    switch (spec.gate) {
      case 'permission':
        return spec.permission ? state.hasPermission(spec.permission) : false;
      case 'control_panel':
        return state.canAccessControlPanel();
      case 'manage_roles':
        return state.canManageRoles();
      default:
        return false;
    }
  });
}

/** The permission strings a role must hold to see every handoff. */
export function handoffPermissionStrings(): string[] {
  return HANDOFF_ROW_SPECS.filter((spec) => spec.gate === 'permission' && spec.permission)
    .map((spec) => spec.permission as string);
}
