// File validation helpers for customer attachments. No imports on purpose (tests run offline).

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

// Decides the real type from the first bytes only. The type the browser declares is ignored.
export function detectMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

// Control characters, zero-width characters and bidirectional-override characters (used to disguise
// a file extension) are removed.
// deno-lint-ignore no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const MAX_NAME_LENGTH = 150;
const MAX_EXTENSION_LENGTH = 10;

export function sanitizeFileName(name: string): string {
  const lastPart = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = lastPart.replace(UNSAFE_CHARACTERS, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "file";
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf(".");
  const extensionLength = dot > 0 ? cleaned.length - dot - 1 : 0;
  const keepExtension = dot > 0 && extensionLength >= 1 && extensionLength <= MAX_EXTENSION_LENGTH;
  const extension = keepExtension ? cleaned.slice(dot) : "";
  const base = keepExtension ? cleaned.slice(0, dot) : cleaned;
  const shortened = base.slice(0, MAX_NAME_LENGTH - extension.length).trimEnd();
  return (shortened || "file") + extension;
}
