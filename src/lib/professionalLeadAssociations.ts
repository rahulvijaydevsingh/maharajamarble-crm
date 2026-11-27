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

export interface LinkedProfessionalCandidate {
  id: string;
  name: string;
  phone?: string | null;
  alternate_phone?: string | null;
  professional_type?: string | null;
}

export interface LinkedProfessional {
  id: string;
  name: string;
  phone: string | null;
  professionalTypeLabel: string;
  roleBadges: string[];
  designationDisplay: string;
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

function hasProfessionalAdditionalContactMatch(
  professional: LinkedProfessionalCandidate,
  lead: ProfessionalLeadRecord,
): boolean {
  if (!Array.isArray(lead.additional_contacts)) return false;

  const professionalPhone = normalizePhone(professional.phone);
  return lead.additional_contacts.some((contact) => {
    if (!contact || typeof contact !== "object") return false;
    const item = contact as Record<string, unknown>;
    const professionalId = typeof item.professional_id === "string" ? item.professional_id : null;
    if (professionalId === professional.id) return true;

    const contactDesignation = typeof item.designation === "string" ? item.designation : null;
    return (
      !professionalId &&
      isProfessionalDesignation(contactDesignation) &&
      professionalPhone.length === 10 &&
      normalizePhone(typeof item.phone === "string" ? item.phone : null) === professionalPhone
    );
  });
}

/**
 * Builds the compact professional rows displayed on a lead profile. Every
 * relationship source is considered, while each professional appears once.
 */
export function resolveLinkedProfessionalsForLead(
  lead: ProfessionalLeadRecord,
  linkRows: ProfessionalLeadLink[],
  candidates: LinkedProfessionalCandidate[],
  formatProfessionalType: (value: string) => string = (value) => formatDesignation(value, ""),
): LinkedProfessional[] {
  const linkedIds = new Set(
    linkRows
      .filter((link) => link.lead_id === lead.id)
      .map((link) => link.professional_id),
  );
  const referredBy =
    lead.referred_by && typeof lead.referred_by === "object" && !Array.isArray(lead.referred_by)
      ? (lead.referred_by as Record<string, unknown>)
      : null;
  const referredById = typeof referredBy?.id === "string" && referredBy.id.trim()
    ? referredBy.id
    : null;
  const primaryLeadPhone = normalizePhone(lead.phone);

  return candidates.flatMap((professional) => {
    const isPrimaryLeadProfessional =
      isProfessionalDesignation(lead.designation) &&
      primaryLeadPhone.length === 10 &&
      normalizePhone(professional.phone) === primaryLeadPhone;
    const isLinked =
      linkedIds.has(professional.id) ||
      referredById === professional.id ||
      hasProfessionalAdditionalContactMatch(professional, lead) ||
      isPrimaryLeadProfessional;
    if (!isLinked) return [];

    const roleBadges = getProfessionalLeadRoleBadges(
      professional.id,
      professional.phone,
      lead,
      linkRows,
    ).sort((first, second) => {
      if (first === "Referrer") return 1;
      if (second === "Referrer") return -1;
      return first.localeCompare(second);
    });
    const professionalTypeLabel = professional.professional_type
      ? formatProfessionalType(professional.professional_type) || formatDesignation(professional.professional_type, "")
      : "";

    return [{
      id: professional.id,
      name: professional.name,
      phone: professional.phone || null,
      professionalTypeLabel,
      roleBadges,
      designationDisplay: [professionalTypeLabel, roleBadges.join(", ")].filter(Boolean).join(" · "),
    }];
  });
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
    if (link.contact_designation?.trim().toLowerCase() === "referrer") {
      badges.add("Referrer");
    } else {
      const designation = formatDesignation(link.contact_designation, "Professional");
      badges.add(`Site ${designation}`);
    }
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
      const itemProfessionalId =
        typeof item.professional_id === "string" ? item.professional_id : null;
      const matchesId = itemProfessionalId === professionalId;
      const matchesPhone =
        !itemProfessionalId &&
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

/** JSONB containment value for a single matching Additional Contact. */
export function buildAdditionalContactsContainsFilter(professionalId: string): string {
  return JSON.stringify([{ professional_id: professionalId }]);
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
