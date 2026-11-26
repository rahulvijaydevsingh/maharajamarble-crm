/**
 * Pure helpers for the `lead_professionals` junction table.
 *
 * The mobile workspace writes the same rows the desktop writes
 * (`src/pages/Leads.tsx` and `src/components/leads/EditSmartLeadForm.tsx`).
 * The rules live here so they can be unit tested in a node environment:
 *
 *  - Group 1 holds the site contacts (the primary contact plus the
 *    professional additional contacts).
 *  - Group 3 holds the referrer.
 *  - A professional can only appear once in the junction table. Postgres
 *    rejects an `ON CONFLICT DO UPDATE` that touches the same row twice
 *    (`21000`), so the duplicate has to be removed before the upsert.
 */

/** One Group 1 junction row, before the lead id is added. */
export interface LeadProfessionalLinkDraft {
  professional_id: string;
  is_primary_contact: boolean;
  contact_designation: string;
}

/** One `lead_professionals` insert row. */
export interface LeadProfessionalLinkInsert extends LeadProfessionalLinkDraft {
  lead_id: string;
}

/**
 * Removes the duplicate professional ids.
 *
 * The primary contact wins — a professional that is both the primary contact
 * and an additional contact stays the primary contact.
 */
export function dedupeLeadProfessionalLinks(
  drafts: LeadProfessionalLinkDraft[] | null | undefined,
): LeadProfessionalLinkDraft[] {
  if (!Array.isArray(drafts)) return [];

  const byProfessionalId = new Map<string, LeadProfessionalLinkDraft>();
  drafts.forEach((draft) => {
    if (!draft?.professional_id) return;
    const existing = byProfessionalId.get(draft.professional_id);
    if (existing && (existing.is_primary_contact || !draft.is_primary_contact)) return;
    byProfessionalId.set(draft.professional_id, draft);
  });

  return Array.from(byProfessionalId.values());
}

/** Builds the `lead_professionals` rows for one lead. */
export function buildLeadProfessionalLinkInserts(
  leadId: string,
  drafts: LeadProfessionalLinkDraft[] | null | undefined,
): LeadProfessionalLinkInsert[] {
  return dedupeLeadProfessionalLinks(drafts).map((draft) => ({
    lead_id: leadId,
    professional_id: draft.professional_id,
    is_primary_contact: draft.is_primary_contact,
    contact_designation: draft.contact_designation,
  }));
}

/**
 * The professional ids that must survive a junction cleanup.
 *
 * A link is kept while it is still in Group 1 or while it is still the
 * Group 3 referrer.
 */
export function preservedLeadProfessionalIds(
  group1ProfessionalIds: Iterable<string>,
  group3ProfessionalId?: string | null,
): Set<string> {
  const preserved = new Set<string>();
  Array.from(group1ProfessionalIds ?? []).forEach((id) => {
    if (id) preserved.add(id);
  });
  if (group3ProfessionalId?.trim()) preserved.add(group3ProfessionalId.trim());
  return preserved;
}

/**
 * The junction rows that are no longer referenced and can be deleted.
 */
export function staleLeadProfessionalIds(
  existingProfessionalIds: string[] | null | undefined,
  preserved: Set<string>,
): string[] {
  return (existingProfessionalIds ?? []).filter((id) => id && !preserved.has(id));
}
