import { describe, expect, it } from 'vitest';

import {
  findDuplicateLead,
  shouldBlockOnDuplicate,
} from '@/mobile/lib/leadDuplicates';

const LEADS = [
  {
    id: 'lead-1',
    full_name: 'Test Customer',
    phone: '9829112233',
    designation: 'owner',
    status: 'new',
  },
  {
    id: 'lead-2',
    full_name: 'Test Professional',
    phone: '9829112299',
    designation: 'architect',
    status: 'in-progress',
  },
];

describe('duplicate lead detection', () => {
  it('finds an existing lead with the same phone number', () => {
    const duplicate = findDuplicateLead(LEADS, '9829112233', { designation: 'owner' });
    expect(duplicate).not.toBeNull();
    expect(duplicate?.id).toBe('lead-1');
    expect(duplicate?.full_name).toBe('Test Customer');
  });

  it('matches a formatted phone number', () => {
    const duplicate = findDuplicateLead(LEADS, '+91 98291 12233', { designation: 'owner' });
    expect(duplicate?.id).toBe('lead-1');
  });

  it('returns null when no lead shares the number', () => {
    expect(findDuplicateLead(LEADS, '9000000000', { designation: 'owner' })).toBeNull();
  });

  it('returns null for an invalid phone number', () => {
    expect(findDuplicateLead(LEADS, '12345', { designation: 'owner' })).toBeNull();
    expect(findDuplicateLead(LEADS, '', { designation: 'owner' })).toBeNull();
    expect(findDuplicateLead(LEADS, null, { designation: 'owner' })).toBeNull();
  });

  it('never blocks a professional designation', () => {
    expect(
      findDuplicateLead(LEADS, '9829112233', { designation: 'architect' }),
    ).toBeNull();
    expect(findDuplicateLead(LEADS, '9829112233', { designation: 'contractor' })).toBeNull();
  });

  it('never matches the lead that is being edited', () => {
    expect(
      findDuplicateLead(LEADS, '9829112233', {
        designation: 'owner',
        excludeLeadId: 'lead-1',
      }),
    ).toBeNull();
  });

  it('tolerates an empty list', () => {
    expect(findDuplicateLead([], '9829112233', { designation: 'owner' })).toBeNull();
    expect(findDuplicateLead(null, '9829112233', { designation: 'owner' })).toBeNull();
  });
});

describe('forceSave duplicate override (D9)', () => {
  const duplicate = {
    id: 'lead-1',
    full_name: 'Test Customer',
    phone: '9829112233',
  };

  it('blocks the save when a duplicate exists', () => {
    expect(shouldBlockOnDuplicate(duplicate, false)).toBe(true);
    expect(shouldBlockOnDuplicate(duplicate, undefined)).toBe(true);
    expect(shouldBlockOnDuplicate(duplicate, null)).toBe(true);
  });

  it('does not block the save when forceSave is set', () => {
    expect(shouldBlockOnDuplicate(duplicate, true)).toBe(false);
  });

  it('never blocks when there is no duplicate', () => {
    expect(shouldBlockOnDuplicate(null, false)).toBe(false);
    expect(shouldBlockOnDuplicate(undefined, false)).toBe(false);
  });
});
