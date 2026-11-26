import { describe, expect, it } from 'vitest';
import { getLeadConversionAction, isLeadConverted } from './leadConversionEligibility';

describe('lead conversion eligibility', () => {
  it('keeps manually won but unconverted leads eligible', () => {
    expect(getLeadConversionAction({ status: 'won' }, true, false)).toBe('fallback');
  });

  it('uses a caller conversion handler when one is supplied', () => {
    expect(getLeadConversionAction({ status: 'new' }, true, true)).toBe('parent');
  });

  it('uses the self-contained dialog path for task and standalone callers', () => {
    expect(getLeadConversionAction({ status: 'quoted' }, true, false)).toBe('fallback');
  });

  it('blocks duplicate conversion for either persisted converted marker', () => {
    expect(isLeadConverted({ is_converted: true })).toBe(true);
    expect(isLeadConverted({ converted_to_customer_id: 'customer-1' })).toBe(true);
    expect(getLeadConversionAction({ is_converted: true }, true, false)).toBe('converted');
    expect(getLeadConversionAction({ converted_to_customer_id: 'customer-1' }, true, true)).toBe('converted');
  });

  it('does not expose conversion for deleted leads or staff without conversion access', () => {
    expect(getLeadConversionAction({ status: 'deleted' }, true, false)).toBe('hidden');
    expect(getLeadConversionAction({ status: 'new' }, false, false)).toBe('hidden');
  });
});