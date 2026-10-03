import { ProfessionalRef } from "@/types/lead";

export interface ExtractedReferredBy {
  id: string | null;
  name: string | null;
}

export function extractReferredBy(value: unknown): ExtractedReferredBy {
  if (typeof value === "string") {
    return {
      id: null,
      name: value.trim() || null,
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      id: null,
      name: null,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    id: typeof record.id === "string" && record.id ? record.id : null,
    name: typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : null,
  };
}

export function normalizeProfessionalRefType(
  value: unknown,
): ProfessionalRef["type"] {
  switch (value) {
    case "architect":
    case "builder":
    case "contractor":
    case "interior_designer":
      return value;
    default:
      return "contractor";
  }
}
