import { describe, expect, it } from 'vitest';

import {
  isEmailLike,
  isSafeStaffName,
  isUuidLike,
  requireSafeStaffName,
  resolveSafeStaffName,
  staffNameFromOptionLabel,
} from '@/mobile/lib/staffAttribution';

describe('INVARIANT-04 staff attribution guard', () => {
  it('recognises email addresses', () => {
    expect(isEmailLike('vijay.kumar@example.com')).toBe(true);
    expect(isEmailLike('vijay.kumar')).toBe(false);
    expect(isEmailLike(null)).toBe(false);
    expect(isEmailLike(undefined)).toBe(false);
  });

  it('recognises UUIDs', () => {
    // A canonical RFC 4122 UUID (8-4-4-4-12)…
    expect(isUuidLike('25747476-91f4-4c1a-9e4e-1a2b3c4d5e6f')).toBe(true);
    expect(isUuidLike('25747476-91F4-4C1A-9E4E-1A2B3C4D5E6F')).toBe(true);
    // …and the malformed variant with a 9 character first group.
    expect(isUuidLike('257474769-1f4c-4a1a-9e4e-1a2b3c4d5e6f')).toBe(true);
    expect(isUuidLike('257474769-1F4C-4A1A-9E4E-1A2B3C4D5E6F')).toBe(true);
    expect(isUuidLike('Test Staff Member')).toBe(false);
  });

  it('treats a real full name as safe', () => {
    expect(isSafeStaffName('Test Staff Member')).toBe(true);
    expect(isSafeStaffName('Meera Sharma')).toBe(true);
  });

  it('treats emails, UUIDs and blanks as unsafe', () => {
    expect(isSafeStaffName('vijay.kumar@example.com')).toBe(false);
    expect(isSafeStaffName('25747476-91f4-4c1a-9e4e-1a2b3c4d5e6f')).toBe(false);
    expect(isSafeStaffName('257474769-1f4c-4a1a-9e4e-1a2b3c4d5e6f')).toBe(false);
    expect(isSafeStaffName('')).toBe(false);
    expect(isSafeStaffName('   ')).toBe(false);
    expect(isSafeStaffName(null)).toBe(false);
    expect(isSafeStaffName(undefined)).toBe(false);
  });

  it('prefers the profile full name over the candidate', () => {
    expect(resolveSafeStaffName('Fallback Name', 'Profile Full Name')).toBe('Profile Full Name');
  });

  it('falls back to the candidate when the profile name is missing', () => {
    expect(resolveSafeStaffName('Fallback Name', null)).toBe('Fallback Name');
    expect(resolveSafeStaffName('Fallback Name', undefined)).toBe('Fallback Name');
  });

  it('rejects an email candidate even when it is the only value', () => {
    // `useActiveStaff()` falls back to the profile email when no full name is
    // set — that value must never reach assigned_to / created_by.
    expect(resolveSafeStaffName('vijay.kumar@example.com', null)).toBeNull();
  });

  it('rejects a UUID candidate', () => {
    expect(resolveSafeStaffName('257474769-1f4c-4a1a-9e4e-1a2b3c4d5e6f', null)).toBeNull();
    expect(resolveSafeStaffName('25747476-91f4-4c1a-9e4e-1a2b3c4d5e6f', null)).toBeNull();
  });

  it('rejects an email profile name and falls through to a safe candidate', () => {
    expect(resolveSafeStaffName('Fallback Name', 'vijay.kumar@example.com')).toBe('Fallback Name');
  });

  it('returns null when nothing usable is available', () => {
    expect(resolveSafeStaffName(null, null)).toBeNull();
    expect(resolveSafeStaffName('a@b.com', 'c@d.com')).toBeNull();
  });

  it('always produces a value for NOT NULL attribution columns', () => {
    expect(requireSafeStaffName(null, null)).toBe('System');
    expect(requireSafeStaffName('a@b.com', null)).toBe('System');
    expect(requireSafeStaffName(null, 'Test Staff Member')).toBe('Test Staff Member');
    expect(requireSafeStaffName(null, null, 'Admin')).toBe('Admin');
  });

  it('strips the role suffix that useActiveStaffOptions appends', () => {
    expect(staffNameFromOptionLabel('Test Staff Member (Admin)', null)).toBe('Test Staff Member');
    expect(staffNameFromOptionLabel('Test Staff Member (Field Agent)', null)).toBe('Test Staff Member');
    expect(staffNameFromOptionLabel('vijay.kumar@example.com (Admin)', null)).toBeNull();
    expect(staffNameFromOptionLabel(undefined, 'Test Staff Member')).toBe('Test Staff Member');
  });
});
