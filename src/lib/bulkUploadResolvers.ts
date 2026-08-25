export const normalizePhone = (value: string): string =>
  String(value || "").replace(/\D/g, "").slice(-10);

export const normalizeEmail = (value: string): string => String(value || "").trim().toLowerCase();

export const normalizeIdentityText = (value: string): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

export const normalizeSource = (value: string): string | null => {
  const normalized = normalizeIdentityText(value).replace(/ /g, "_");
  const aliases: Record<string, string> = {
    walk_in: "walk_in",
    walkin: "walk_in",
    field_visit: "field_visit",
    fieldvisit: "field_visit",
    site_visit: "field_visit",
    cold_call: "cold_call",
    coldcall: "cold_call",
    online_enquiry: "online_enquiry",
    online: "online_enquiry",
    website: "online_enquiry",
    web: "online_enquiry",
    professional_referral: "professional_referral",
    referral: "professional_referral",
    architect_referral: "professional_referral",
    builder_referral: "professional_referral",
    instagram: "instagram",
    insta: "instagram",
    facebook: "facebook",
    fb: "facebook",
    google: "google",
    google_ads: "google",
    justdial: "justdial",
    other: "other",
  };
  return aliases[normalized] ?? null;
};

export const resolvePriority = (value: string, constructionStage: string): number => {
  const normalized = normalizeIdentityText(value).replace(/ /g, "_");
  const aliases: Record<string, number> = {
    "1": 1, very_high: 1, critical: 1, urgent: 1, hot: 1,
    "2": 2, high: 2, important: 2,
    "3": 3, medium: 3, normal: 3, moderate: 3, standard: 3,
    "4": 4, low: 4,
    "5": 5, very_low: 5, cold: 5, low_urgency: 5,
  };
  if (aliases[normalized]) return aliases[normalized];
  const stage = normalizeIdentityText(constructionStage).replace(/ /g, "_");
  return stage === "flooring_ready" || stage === "renovation" ? 1 : stage === "excavation" ? 5 : 3;
};