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
