import { describe, expect, it } from 'vitest';

import {
  FULL_CRM_TARGETS,
  buildHandoffPath,
  buildHandoffRoute,
  openFullCrmRoute,
  resolveFullCrmTarget,
} from '@/mobile/routing/handoffHelper';

describe('full CRM handoff helper', () => {
  it('resolves a known target code to its label and desktop path', () => {
    expect(resolveFullCrmTarget('leads')).toEqual({
      label: 'Leads',
      path: '/leads',
    });
    expect(resolveFullCrmTarget('professionals/new')).toEqual({
      label: 'New Professional (Full CRM)',
      path: '/professionals',
    });
    expect(resolveFullCrmTarget('crm/workspace')).toEqual({
      label: 'Full CRM Workspace',
      path: '/',
    });
  });

  it('resolves every named code of the handoff matrix', () => {
    expect(resolveFullCrmTarget('calendar')).toEqual({
      label: 'Calendar',
      path: '/calendar',
    });
    expect(resolveFullCrmTarget('todo-lists')).toEqual({
      label: 'To-do Lists',
      path: '/todo-lists',
    });
    expect(resolveFullCrmTarget('quotations')).toEqual({
      label: 'Quotations',
      path: '/quotations',
    });
    expect(resolveFullCrmTarget('leads/new')).toEqual({
      label: 'New Lead (Full CRM)',
      path: '/leads',
    });
    expect(resolveFullCrmTarget('customers/new')).toEqual({
      label: 'New Customer (Full CRM)',
      path: '/customers',
    });
    expect(resolveFullCrmTarget('professionals/new')).toEqual({
      label: 'New Professional (Full CRM)',
      path: '/professionals',
    });
    expect(resolveFullCrmTarget('customers')).toEqual({
      label: 'Customers',
      path: '/customers',
    });
    expect(resolveFullCrmTarget('settings')).toEqual({
      label: 'Settings',
      path: '/settings',
    });
    expect(resolveFullCrmTarget('automation')).toEqual({
      label: 'Automation Rules',
      path: '/automation',
    });
    expect(resolveFullCrmTarget('api-docs')).toEqual({
      label: 'API Docs',
      path: '/api-docs',
    });
  });

  it('resolves the performance reports target', () => {
    expect(resolveFullCrmTarget('performance')).toEqual({
      label: 'Performance Reports',
      path: '/performance',
    });
    expect(FULL_CRM_TARGETS.performance).toEqual({
      label: 'Performance Reports',
      path: '/performance',
    });
  });

  it('never accepts a raw path — a raw path is an open redirect', () => {
    // `//evil.com` is a protocol-relative URL: accepting it would turn the
    // handoff into an open redirect.
    expect(resolveFullCrmTarget('//evil.com')).not.toEqual({ label: 'Full CRM', path: '//evil.com' });
    expect(resolveFullCrmTarget('//evil.com')).toEqual(FULL_CRM_TARGETS.workspace);

    expect(resolveFullCrmTarget('/leads')).not.toEqual({ label: 'Full CRM', path: '/leads' });
    expect(resolveFullCrmTarget('/leads')).toEqual(FULL_CRM_TARGETS.workspace);

    expect(resolveFullCrmTarget('/hr/attendance')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('../../etc/passwd')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('https://evil.com')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('javascript:alert(1)')).toEqual(FULL_CRM_TARGETS.workspace);
  });

  it('falls back to the CRM root for an unknown code so the handoff never dead-links', () => {
    expect(resolveFullCrmTarget('does-not-exist')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('   ')).toEqual(FULL_CRM_TARGETS.workspace);
    // Inherited object members are not targets either.
    expect(resolveFullCrmTarget('constructor')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('toString')).toEqual(FULL_CRM_TARGETS.workspace);
  });

  it('navigates to the resolved desktop path', () => {
    const visited: string[] = [];
    const result = openFullCrmRoute('customers', (path) => visited.push(path));
    expect(visited).toEqual(['/customers']);
    expect(result.path).toBe('/customers');
  });

  it('never navigates to an untrusted path', () => {
    const visited: string[] = [];
    openFullCrmRoute('//evil.com', (path) => visited.push(path));
    expect(visited).toEqual(['/']);
  });

  it('builds an in-workspace handoff route', () => {
    expect(buildHandoffRoute('quotations')).toEqual({
      name: 'full_crm_handoff',
      targetLabel: 'Quotations',
      targetCode: 'quotations',
    });
  });

  it('builds a mobile URL for the handoff placeholder', () => {
    expect(buildHandoffPath('quotations')).toBe('/m/handoff/quotations');
  });
});
