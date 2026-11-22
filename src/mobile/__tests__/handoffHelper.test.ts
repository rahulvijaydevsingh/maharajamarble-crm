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

  it('accepts a raw desktop path', () => {
    expect(resolveFullCrmTarget('/hr/attendance')).toEqual({
      label: 'Full CRM',
      path: '/hr/attendance',
    });
  });

  it('falls back to the CRM root for an unknown code so the handoff never dead-links', () => {
    expect(resolveFullCrmTarget('does-not-exist')).toEqual(FULL_CRM_TARGETS.workspace);
    expect(resolveFullCrmTarget('')).toEqual(FULL_CRM_TARGETS.workspace);
  });

  it('navigates to the resolved desktop path', () => {
    const visited: string[] = [];
    const result = openFullCrmRoute('customers', (path) => visited.push(path));
    expect(visited).toEqual(['/customers']);
    expect(result.path).toBe('/customers');
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
