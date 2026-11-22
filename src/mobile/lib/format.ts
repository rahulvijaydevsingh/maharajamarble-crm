/**
 * Pure display/format helpers for the mobile workspace.
 *
 * These are ported from the AI Studio prototype's mock adapter, but they now
 * build on the repository's canonical phone helpers (`@/lib/phone`) so the
 * mobile workspace and the desktop agree on what a valid Indian mobile number
 * is. Every helper is pure and safe to unit test in a node environment.
 */

import { normalizePhone10, toPhoneE164 } from '@/lib/phone';

const DEFAULT_DATE_INPUT = '2026-11-21';
const DEFAULT_TIME_INPUT = '10:00';

/**
 * Lenient digit extraction used for display only. It keeps the last 10 digits
 * of any digit string so a stored number with a country prefix still renders
 * sensibly. Validation must use `normalizePhone10` from `@/lib/phone`.
 */
export function digitsOnly10(raw?: string | null): string {
  if (typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Renders a phone number as `+91 98291 12233` when it is a valid mobile. */
export function formatPhoneDisplay(phone?: string | null): string {
  const raw = typeof phone === 'string' ? phone.trim() : '';
  if (!raw) return '—';
  const normalized = normalizePhone10(raw);
  if (!normalized) return raw;
  return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
}

/** `tel:` deep link. Falls back to the raw digits for non-Indian numbers. */
export function buildTelUrl(phone?: string | null): string {
  const normalized = normalizePhone10(phone);
  if (normalized) {
    return `tel:+${toPhoneE164(normalized)}`;
  }
  const digits = digitsOnly10(phone);
  return `tel:${digits || ''}`;
}

/**
 * Opens a blank WhatsApp chat. No message template is ever appended — the
 * link must stay a bare `https://wa.me/<number>`.
 */
export function buildWhatsAppUrl(phone?: string | null): string {
  const normalized = normalizePhone10(phone);
  if (normalized) {
    return `https://wa.me/${toPhoneE164(normalized)}`;
  }
  const digits = digitsOnly10(phone);
  return `https://wa.me/${digits}`;
}

/** Google Maps search link for a site address / plus code. */
export function buildMapsUrl(location?: string | null, plusCode?: string | null): string {
  const query = plusCode ? `${plusCode} ${location ?? ''}`.trim() : (location ?? '').trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** `21 Nov · 10:00 AM` style label used in list rows. */
export function formatShortDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${day} · ${time}`;
}

/** `Sat, 21 Nov · 10:00 AM` style label used above sheets. */
export function formatDateTimeInputDisplay(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

/** `YYYY-MM-DD` in the device's local timezone, for `<input type="date">`. */
export function toLocalDateInputValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return DEFAULT_DATE_INPUT;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** `HH:MM` in the device's local timezone, for `<input type="time">`. */
export function toLocalTimeInputValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return DEFAULT_TIME_INPUT;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

/** Combines a `YYYY-MM-DD` + `HH:MM` pair into an ISO timestamp. */
export function combineDateAndTime(dateStr?: string | null, timeStr?: string | null): string {
  const safeDate = dateStr || DEFAULT_DATE_INPUT;
  const safeTime = timeStr || DEFAULT_TIME_INPUT;
  const parsed = new Date(`${safeDate}T${safeTime}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Human readable byte size, e.g. `248 KB`. */
export function formatFileSize(bytes?: number | null): string {
  const size = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0;
  if (size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when both timestamps fall on the same calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
