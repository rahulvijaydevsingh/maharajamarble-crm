import { describe, expect, it } from 'vitest';

import {
  CALL_LOG_PICKER_MAX_MATCHES,
  filterCallLogContacts,
  hasMoreCallLogMatches,
  type CallLogContact,
} from '@/mobile/lib/contactPicker';

function contacts(count: number): CallLogContact[] {
  return Array.from({ length: count }, (_unused, index) => ({
    entityType: 'lead' as const,
    entityId: `lead-${index}`,
    name: `Contact ${index}`,
    phone: `98291122${String(index).padStart(2, '0')}`,
    sub: `Firm ${index}`,
  }));
}

describe('filterCallLogContacts', () => {
  it('returns the first 50 contacts for an empty query', () => {
    const result = filterCallLogContacts(contacts(120), '');
    expect(result).toHaveLength(CALL_LOG_PICKER_MAX_MATCHES);
    expect(result[0].entityId).toBe('lead-0');
  });

  it('matches the name, the phone number and the secondary line', () => {
    const list = contacts(5);
    expect(filterCallLogContacts(list, 'contact 3').map((c) => c.entityId)).toEqual([
      'lead-3',
    ]);
    expect(filterCallLogContacts(list, '9829112204').map((c) => c.entityId)).toEqual([
      'lead-4',
    ]);
    expect(filterCallLogContacts(list, 'firm 2').map((c) => c.entityId)).toEqual(['lead-2']);
  });

  it('ignores the case and the surrounding whitespace', () => {
    const list = contacts(5);
    expect(filterCallLogContacts(list, '  CONTACT 1 ').map((c) => c.entityId)).toEqual([
      'lead-1',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCallLogContacts(contacts(5), 'zzz-not-here')).toEqual([]);
  });

  it('caps a wide match at 50 entries', () => {
    const list = contacts(120);
    const result = filterCallLogContacts(list, 'contact');
    expect(result).toHaveLength(CALL_LOG_PICKER_MAX_MATCHES);
  });
});

describe('hasMoreCallLogMatches', () => {
  it('is true when the match set is larger than the cap', () => {
    expect(hasMoreCallLogMatches(contacts(120), '')).toBe(true);
    expect(hasMoreCallLogMatches(contacts(20), '')).toBe(false);
  });

  it('is false when the search narrows the list below the cap', () => {
    expect(hasMoreCallLogMatches(contacts(120), 'contact 7')).toBe(false);
  });
});
