/**
 * Contact picker helpers for the mobile "Log a Call" quick action.
 *
 * The picker can be opened from a device that holds thousands of leads,
 * customers and professionals. Rendering all of them in a sheet made the
 * mobile workspace crawl on low-end phones, so the list is searchable and
 * capped.
 *
 * Every helper here is pure so it can be unit tested in the node environment.
 */

import type { EntityKind } from '@/mobile/types/crmTypes';

/** One row of the contact picker. */
export interface CallLogContact {
  entityType: EntityKind;
  entityId: string;
  name: string;
  phone: string;
  sub: string;
}

/** The hard cap on how many contacts are rendered at once. */
export const CALL_LOG_PICKER_MAX_MATCHES = 50;

/** Normalises a search term for a case-insensitive comparison. */
function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Filters the contact list by a free-text query and caps the result.
 *
 * The query matches the contact name, the phone number or the secondary line
 * (the firm name / id fragment). An empty query returns the first
 * `cap` contacts unchanged.
 */
export function filterCallLogContacts(
  contacts: CallLogContact[],
  query: string,
  cap: number = CALL_LOG_PICKER_MAX_MATCHES,
): CallLogContact[] {
  const list = Array.isArray(contacts) ? contacts : [];
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : CALL_LOG_PICKER_MAX_MATCHES;
  const term = normalizeSearchText(query ?? '');

  const matched = term.length === 0
    ? list
    : list.filter((contact) => {
        const haystack = [
          contact.name ?? '',
          contact.phone ?? '',
          contact.sub ?? '',
        ]
          .map(normalizeSearchText)
          .join(' ');
        return haystack.includes(term);
      });

  return matched.slice(0, limit);
}

/**
 * True when the picker has more matches than it is allowed to render.
 *
 * The caller uses this to show the "showing the first 50" hint.
 */
export function hasMoreCallLogMatches(
  contacts: CallLogContact[],
  query: string,
  cap: number = CALL_LOG_PICKER_MAX_MATCHES,
): boolean {
  const list = Array.isArray(contacts) ? contacts : [];
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : CALL_LOG_PICKER_MAX_MATCHES;
  const term = normalizeSearchText(query ?? '');

  const matchedCount = term.length === 0
    ? list.length
    : list.filter((contact) => {
        const haystack = [
          contact.name ?? '',
          contact.phone ?? '',
          contact.sub ?? '',
        ]
          .map(normalizeSearchText)
          .join(' ');
        return haystack.includes(term);
      }).length;

  return matchedCount > limit;
}
