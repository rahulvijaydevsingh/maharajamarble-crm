import { isProfessionalDesignation, normalizePhone } from "@/lib/professionalResolver";

export interface ProfessionalLeadLink {
  lead_id: string;
  professional_id: string;
  is_primary_contact: boolean;
  contact_designation: string | null;
}

export interface ProfessionalLeadRecord {
  id: string;
  designation?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  professional_id?: string | null;
  referred_by?: unknown;
  additional_contacts?: unknown;
}

export interface ReferralLeadProfessionalInsert {
  lead_id: string;
  professional_id: string;
  is_primary_contact: false;
  contact_designation: "referrer";
}

function formatDesignation(value?: string | null, fallback = "Professional"): string {
  return value
    ? value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
    : fallback;
}

/**
 * Resolve every applicable relationship label for one lead. A professional can
 * be both the source referrer and a Group 1 site contact at the same time.
 */
export function getProfessionalLeadRoleBadges(
  professionalId: string,
  professionalPhone: string | null | undefined,
  lead: ProfessionalLeadRecord,
  linkRows: ProfessionalLeadLink[] = [],
): string[] {
  const badges = new Set<string>();
  const normalizedProfessionalPhone = normalizePhone(professionalPhone);

  for (const link of linkRows) {
    if (link.lead_id !== lead.id || link.professional_id !== professionalId) continue;
    const designation = formatDesignation(link.contact_designation, "Site Professional");
    badges.add(link.is_primary_contact ? `Site ${designation}` : designation);
  }

  const referredBy =
    lead.referred_by && typeof lead.referred_by === "object" && !Array.isArray(lead.referred_by)
      ? (lead.referred_by as Record<string, unknown>)
      : null;
  const referredById = typeof referredBy?.id === "string" ? referredBy.id : null;
  const referredByPhone = typeof referredBy?.phone === "string"
    ? normalizePhone(referredBy.phone)
    : "";

  const matchesReferralByPhone =
    !referredById &&
    normalizedProfessionalPhone.length === 10 &&
    referredByPhone.length === 10 &&
    normalizedProfessionalPhone === referredByPhone;
  if (referredById === professionalId || matchesReferralByPhone) {
    badges.add("Referrer");
  }

  const leadPhone = normalizePhone(lead.phone);
  const matchesPrimaryLeadByPhone =
    !lead.professional_id &&
    normalizedProfessionalPhone.length === 10 &&
    leadPhone.length === 10 &&
    normalizedProfessionalPhone === leadPhone;
  if (
    isProfessionalDesignation(lead.designation) &&
    (lead.professional_id === professionalId || matchesPrimaryLeadByPhone)
  ) {
    badges.add(`Site ${formatDesignation(lead.designation, "Professional")}`);
  }

  if (Array.isArray(lead.additional_contacts)) {
    for (const contact of lead.additional_contacts) {
      if (!contact || typeof contact !== "object") continue;
      const item = contact as Record<string, unknown>;
      const itemPhone = typeof item.phone === "string" ? normalizePhone(item.phone) : "";
      const matchesId = item.professional_id === professionalId;
      const matchesPhone =
        isProfessionalDesignation(typeof item.designation === "string" ? item.designation : null) &&
        normalizedProfessionalPhone.length === 10 &&
        itemPhone.length === 10 &&
        normalizedProfessionalPhone === itemPhone;

      if (matchesId || matchesPhone) {
        badges.add(`Site ${formatDesignation(
          typeof item.designation === "string" ? item.designation : null,
          "Professional",
        )}`);
      }
    }
  }

  return Array.from(badges);
}

/**
 * A Group 3 junction row is created only for a selected professional object
 * with a stable ID. Free-text referral values remain on leads.referred_by only.
 */
export function buildReferralLinkInsert(
  leadId: string,
  referredBy: unknown,
): ReferralLeadProfessionalInsert | null {
  if (!referredBy || typeof referredBy !== "object" || Array.isArray(referredBy)) return null;
  const professionalId = (referredBy as Record<string, unknown>).id;
  if (typeof professionalId !== "string" || !professionalId.trim()) return null;

  return {
    lead_id: leadId,
    professional_id: professionalId.trim(),
    is_primary_contact: false,
    contact_designation: "referrer",
  };
}

/** Keep a link while it remains in either Group 1 or Group 3. */
export function getPreservedProfessionalIds(
  group1ProfessionalIds: Iterable<string>,
  group3ProfessionalId?: string | null,
): Set<string> {
  const preserved = new Set(group1ProfessionalIds);
  if (group3ProfessionalId?.trim()) preserved.add(group3ProfessionalId.trim());
  return preserved;
}
