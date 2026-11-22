/**
 * Handoff helper: sends the field user from the mobile workspace back to the
 * full desktop CRM for the screens that only exist on desktop (quotations,
 * automations, control panel, payroll, …).
 *
 * The mobile workspace never reimplements those surfaces — it deep-links into
 * the desktop router instead, and the desktop router can then deep-link back
 * into the mobile workspace (see `mapDesktopPathToMobile`).
 */

import type { MobileRoute } from '@/mobile/types/crmTypes';
import { buildMobilePath } from '@/mobile/routing/workspacePreference';

/** Canonical desktop destinations reachable from the mobile workspace. */
export const FULL_CRM_TARGETS = {
  workspace: { label: 'Full CRM Workspace', path: '/' },
  leads: { label: 'Leads', path: '/leads' },
  leadsNew: { label: 'New Lead (Full CRM)', path: '/leads' },
  customers: { label: 'Customers', path: '/customers' },
  customersNew: { label: 'New Customer (Full CRM)', path: '/customers' },
  professionals: { label: 'Professionals', path: '/professionals' },
  professionalsNew: { label: 'New Professional (Full CRM)', path: '/professionals' },
  tasks: { label: 'Tasks', path: '/tasks' },
  calendar: { label: 'Calendar', path: '/calendar' },
  todoLists: { label: 'To-do Lists', path: '/todo-lists' },
  messages: { label: 'Internal Messages', path: '/messages' },
  quotations: { label: 'Quotations', path: '/quotations' },
  attendance: { label: 'Attendance', path: '/hr/attendance' },
  settings: { label: 'Settings', path: '/settings' },
  automation: { label: 'Automation Rules', path: '/automation' },
  apiDocs: { label: 'API Docs', path: '/api-docs' },
} as const;

export type FullCrmTargetKey = keyof typeof FULL_CRM_TARGETS;

const TARGET_CODE_BY_KEY: Record<string, string> = {
  workspace: 'crm/workspace',
  leads: 'leads',
  leadsNew: 'leads/new',
  customers: 'customers',
  customersNew: 'customers/new',
  professionals: 'professionals',
  professionalsNew: 'professionals/new',
  tasks: 'tasks',
  calendar: 'calendar',
  todoLists: 'todo-lists',
  messages: 'messages',
  quotations: 'quotations',
  attendance: 'attendance',
  settings: 'settings',
  automation: 'automation',
  apiDocs: 'api-docs',
};

const TARGET_BY_CODE: Record<string, { label: string; path: string }> = Object.entries(
  FULL_CRM_TARGETS,
).reduce<Record<string, { label: string; path: string }>>((acc, [key, value]) => {
  const code = TARGET_CODE_BY_KEY[key];
  if (code) acc[code] = value;
  return acc;
}, {});

/**
 * Resolves a target code to its desktop label and path.
 *
 * Accepts the canonical codes above, a raw desktop path (anything starting
 * with `/`), or an unknown code — which falls back to the CRM root so the
 * handoff can never produce a dead link.
 */
export function resolveFullCrmTarget(targetCode: string): { label: string; path: string } {
  const code = (targetCode ?? '').trim();
  if (TARGET_BY_CODE[code]) return TARGET_BY_CODE[code];
  if (code.startsWith('/')) {
    return { label: 'Full CRM', path: code };
  }
  return FULL_CRM_TARGETS.workspace;
}

/**
 * Navigates to the desktop CRM route for `targetCode`.
 *
 * `navigate` is injected so the helper stays free of router dependencies and
 * remains unit testable.
 */
export function openFullCrmRoute(
  targetCode: string,
  navigate: (path: string) => void,
): { label: string; path: string } {
  const target = resolveFullCrmTarget(targetCode);
  navigate(target.path);
  return target;
}

/**
 * Builds the in-workspace "Full CRM" placeholder route shown when the user
 * asks to hand off to a desktop-only surface.
 */
export function buildHandoffRoute(targetCode: string): MobileRoute {
  const target = resolveFullCrmTarget(targetCode);
  return {
    name: 'full_crm_handoff',
    targetLabel: target.label,
    targetCode: targetCode || 'crm/workspace',
  };
}

/** Convenience: the mobile URL for a handoff placeholder route. */
export function buildHandoffPath(targetCode: string): string {
  return buildMobilePath(buildHandoffRoute(targetCode));
}
