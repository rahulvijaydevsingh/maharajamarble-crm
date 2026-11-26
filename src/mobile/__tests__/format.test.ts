import { describe, expect, it } from 'vitest';

import { buildTelUrl, buildWhatsAppUrl, extractEditablePhone10 } from '@/mobile/lib/format';

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

describe('buildTelUrl', () => {
  it('keeps the canonical form of a valid Indian mobile', () => {
    expect(buildTelUrl('9829112233')).toBe('tel:+919829112233');
    expect(buildTelUrl('+91 98291 12233')).toBe('tel:+919829112233');
    expect(buildTelUrl('09829112233')).toBe('tel:+919829112233');
  });

  it('keeps every digit of a landline', () => {
    // The old `digitsOnly10()` cut the number down to ten digits and threw
    // the trunk prefix away.
    expect(buildTelUrl('040 2345 6789')).toBe('tel:04023456789');
    expect(buildTelUrl('04023456789')).toBe('tel:04023456789');
  });

  it('keeps the country code of an international number', () => {
    expect(buildTelUrl('+971 50 123 4567')).toBe('tel:+971501234567');
    expect(buildTelUrl('+91 40 1234 5678')).toBe('tel:+914012345678');
  });

  it('drops the characters that are illegal in a tel URI', () => {
    expect(buildTelUrl('+91 98291 12233 # ext')).toBe('tel:+919829112233');
    expect(buildTelUrl('   ')).toBe('tel:');
    expect(buildTelUrl('')).toBe('tel:');
    expect(buildTelUrl(null)).toBe('tel:');
    expect(buildTelUrl(undefined)).toBe('tel:');
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds a bare link for a valid Indian mobile', () => {
    expect(buildWhatsAppUrl('9829112233')).toBe('https://wa.me/919829112233');
    expect(buildWhatsAppUrl('+91 98291 12233')).toBe('https://wa.me/919829112233');
  });

  it('never appends a message template', () => {
    expect(buildWhatsAppUrl('9829112233')).not.toContain('?text=');
    expect(buildWhatsAppUrl('9829112233')).not.toContain('send=');
  });

  it('stays on normalizePhone10 — a non-mobile never becomes an Indian mobile link', () => {
    expect(buildWhatsAppUrl('040 2345 6789')).not.toBe('https://wa.me/919829112233');
    expect(buildWhatsAppUrl('+971 50 123 4567')).not.toMatch(/^https:\/\/wa\.me\/91[6-9]\d{9}$/);
    expect(buildWhatsAppUrl('')).not.toMatch(/^https:\/\/wa\.me\/91[6-9]\d{9}$/);
  });
});
