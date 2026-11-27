/**
 * Duplicate-lead detection for the mobile workspace.
 *
 * The check runs against the lead list the mobile workspace already has in
 * memory (from `useLeads()`), so it is synchronous, costs no extra round trip
 * and never performs a table scan.
 *
 * The desktop shows the duplicate warning only for **non-professional**
 * designations — a professional lead legitimately shares its phone number
 * with the professional record it links to.
 */

import { isProfessionalDesignation } from '@/lib/professionalResolver';
import { normalizePhone10 } from '@/lib/phone';

export interface DuplicateLeadCandidate {
  id: string;
  full_name: string;
  phone: string;
  designation?: string | null;
  status?: string | null;
  assigned_to?: string | null;
}

export interface DuplicateCandidateLike {
  id: string;
  full_name: string;
  phone: string;
  designation?: string | null;
  status?: string | null;
  assigned_to?: string | null;
}

export interface DuplicateLookupOptions {
  /** The designation being saved. Professional designations skip the warning. */
  designation?: string | null;
  /** The lead being edited — it must never match itself. */
  excludeLeadId?: string | null;
}

/**
 * Finds an existing lead with the same phone number.
 *
 * Returns `null` when:
 *  - the phone number is not a valid 10-digit Indian mobile,
 *  - the designation is a professional designation, or
 *  - no existing lead shares the number.
 */
export function findDuplicateLead(
  leads: DuplicateCandidateLike[] | null | undefined,
  phone: string | null | undefined,
  options: DuplicateLookupOptions = {},
): DuplicateLeadCandidate | null {
  if (!Array.isArray(leads) || leads.length === 0) return null;

  const normalized = normalizePhone10(phone);
  if (!normalized) return null;

  if (isProfessionalDesignation(options.designation)) return null;

  const match = leads.find((lead) => {
    if (!lead) return false;
    if (options.excludeLeadId && lead.id === options.excludeLeadId) return false;
    return normalizePhone10(lead.phone) === normalized;
  });

  if (!match) return null;

  return {
    id: match.id,
    full_name: match.full_name,
    phone: match.phone,
    designation: match.designation ?? null,
    status: match.status ?? null,
    assigned_to: match.assigned_to ?? null,
  };
}

/**
 * Decides whether the save must be blocked by the duplicate modal.
 *
 * `forceSave` is the D9 override: when the field user taps "Save Anyway" in
 * the duplicate modal, the lead is saved instead of being blocked.
 *
 * Only the presence of a duplicate matters here, so any record with an `id`
 * is accepted (the screen passes the live lead row it wants to show in the
 * modal).
 */
export function shouldBlockOnDuplicate(
  duplicate: { id: string } | null | undefined,
  forceSave: boolean | null | undefined,
): boolean {
  if (!duplicate) return false;
  if (forceSave) return false;
  return true;
}
