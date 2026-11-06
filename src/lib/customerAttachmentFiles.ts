// Small helpers for the customer attachment picker (no screen code here, so they are easy to test).

export const MAX_STAGED_ATTACHMENTS = 10;

export type PreviewKind = "image" | "pdf" | "none";

/** What kind of on-screen preview a picked file can have. */
export function getPreviewKind(file: { name: string; type: string }): PreviewKind {
  const type = (file.type || "").toLowerCase();
  const extension = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
  if (type.startsWith("image/") || (!type && ["jpg", "jpeg", "png", "webp"].includes(extension))) return "image";
  if (type === "application/pdf" || (!type && extension === "pdf")) return "pdf";
  return "none";
}

export type StageResult = { files: File[]; error: null } | { files: File[]; error: string };

/**
 * New-customer form: a picked file goes straight into the list that is uploaded when the customer is saved.
 * (There is no separate "confirm" step there; pressing Save is the confirmation.)
 */
export function addStagedFile(existing: File[], file: File): StageResult {
  if (existing.some((f) => f.name === file.name && f.size === file.size)) {
    return { files: existing, error: "This file is already in the list." };
  }
  if (existing.length >= MAX_STAGED_ATTACHMENTS) {
    return { files: existing, error: "You can attach up to " + MAX_STAGED_ATTACHMENTS + " files at a time." };
  }
  return { files: [...existing, file], error: null };
}
