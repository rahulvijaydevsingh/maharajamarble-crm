import { supabase } from "@/integrations/supabase/client";

export type MinimalProfessional = {
  id: string;
  name: string;
  phone: string | null;
  firm_name: string | null;
  professional_type: string | null;
};

export const CANONICAL_PROFESSIONAL_DESIGNATIONS = [
  "architect",
  "interior_designer",
  "contractor",
  "builder",
  "engineer",
  "pmc",
  "consultant",
  "structural_engineer",
  "landscape_architect",
  "site_supervisor",
  "real_estate_developer",
  "kitchen_maker",
  "supplier",
  "vendor",
  "partner",
] as const;

export function normalizeDesignation(designation?: string | null): string {
  if (!designation) return "";
  return designation.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function isProfessionalDesignation(designation?: string | null): boolean {
  if (!designation) return false;
  const normalized = normalizeDesignation(designation);
  if (!normalized) return false;
  return CANONICAL_PROFESSIONAL_DESIGNATIONS.includes(
    normalized as (typeof CANONICAL_PROFESSIONAL_DESIGNATIONS)[number]
  );
}

export function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length >= 10) {
    return cleaned.slice(-10);
  }
  return cleaned;
}

export type ProfessionalLeadCandidate = {
  id: string;
  phone: string | null;
  status?: string | null;
};

export type LeadProfessionalLink = {
  professional_id: string;
  is_primary_contact: boolean;
};

/**
 * Returns a professional only when the lead represents that person and the
 * relationship is proven by a primary lead link or by one unique active phone match.
 */
export function resolveProfessionalForProfessionalLead(
  designation: string | null | undefined,
  leadPhone: string | null | undefined,
  professionals: ProfessionalLeadCandidate[],
  leadProfessionalLinks: LeadProfessionalLink[] = [],
): string | null {
  const normalizedLeadPhone = normalizePhone(leadPhone);
  if (!isProfessionalDesignation(designation) || normalizedLeadPhone.length !== 10) {
    return null;
  }

  const matchingProfessionals = professionals.filter((professional) =>
    (professional.status?.toLowerCase() ?? "active") === "active" &&
    normalizePhone(professional.phone) === normalizedLeadPhone,
  );
  const primaryMatches = new Set(
    leadProfessionalLinks
      .filter((link) => link.is_primary_contact)
      .map((link) => link.professional_id),
  );
  const verifiedMatches = matchingProfessionals.filter((professional) =>
    primaryMatches.size === 0 || primaryMatches.has(professional.id),
  );

  return verifiedMatches.length === 1 ? verifiedMatches[0].id : null;
}

export function mapDesignationToProfessionalType(designation?: string | null): string {
  if (!designation) return "contractor";
  const normalized = normalizeDesignation(designation);
  const validTypes = [
    "contractor",
    "supplier",
    "consultant",
    "partner",
    "vendor",
    "architect",
    "engineer",
    "interior_designer",
    "kitchen_maker",
    "builder",
    "real_estate_developer",
    "site_supervisor",
  ];
  if (validTypes.includes(normalized)) {
    return normalized;
  }
  return "contractor";
}

export async function resolveProfessionalById(
  id: string,
  cached?: MinimalProfessional | null
): Promise<MinimalProfessional | null> {
  if (cached) return cached;
  const { data, error } = await supabase
    .from("professionals")
    .select("id,name,phone,firm_name,professional_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id,
        name: data.name,
        phone: data.phone || null,
        firm_name: data.firm_name || null,
        professional_type: data.professional_type || null,
      }
    : null;
}
