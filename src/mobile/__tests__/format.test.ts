import { describe, expect, it } from 'vitest';

import { extractEditablePhone10 } from '@/mobile/lib/format';

describe('extractEditablePhone10', () => {
  it('keeps a clean ten digit number', () => {
    expect(extractEditablePhone10('9829112233')).toBe('9829112233');
  });

  it('strips a country prefix instead of truncating the number', () => {
    // The old `digits.slice(0, 10)` turned "+91 98291 12233" into
    // "9198291122" — the prefix ate the first two digits of the number.
    expect(extractEditablePhone10('+91 98291 12233')).toBe('9829112233');
    expect(extractEditablePhone10('+919829112233')).toBe('9829112233');
    expect(extractEditablePhone10('91 98291 12233')).toBe('9829112233');
  });

  it('strips a leading trunk zero', () => {
    expect(extractEditablePhone10('09829112233')).toBe('9829112233');
    expect(extractEditablePhone10('0 98291 12233')).toBe('9829112233');
  });

  it('tolerates the spacing a human types', () => {
    expect(extractEditablePhone10('98291 12233')).toBe('9829112233');
    expect(extractEditablePhone10('(982) 911-2233')).toBe('9829112233');
  });

  it('returns an empty string for an empty value', () => {
    expect(extractEditablePhone10('')).toBe('');
    expect(extractEditablePhone10(null)).toBe('');
    expect(extractEditablePhone10(undefined)).toBe('');
  });

  it('caps a number that cannot be normalized', () => {
    expect(extractEditablePhone10('123456789')).toBe('123456789');
  });
});
