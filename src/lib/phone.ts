/**
 * Canonical Indian 10-digit mobile phone normalizer (WhatsApp v2 Appendix B).
 * Rules applied in strict order:
 * 1) Strip every character that is not an ASCII digit (0-9).
 * 2) If 10 digits remain, keep them.
 *    If 11 digits start with "0", drop the leading "0".
 *    If 12 digits start with "91", drop the leading "91".
 *    If 14 digits start with "0091", drop the leading "0091".
 *    Any other length returns null.
 * 3) The resulting 10 digits must start with 6, 7, 8, or 9; otherwise null.
 */
export function normalizePhone10(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  const digits = raw.replace(/[^0-9]/g, "");
  let candidate: string | null = null;

  if (digits.length === 10) {
    candidate = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    candidate = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    candidate = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith("0091")) {
    candidate = digits.slice(4);
  } else {
    return null;
  }

  if (!/^[6-9][0-9]{9}$/.test(candidate)) {
    return null;
  }

  return candidate;
}

/**
 * Converts a normalized 10-digit Indian mobile number (or raw phone string)
 * into digits-only E.164 format ("91" + phone10), or null if invalid.
 */
export function toPhoneE164(rawOrPhone10: string | null | undefined): string | null {
  const phone10 = normalizePhone10(rawOrPhone10);
  return phone10 ? `91${phone10}` : null;
}

/**
 * Masks a phone number to its last 4 digits for safe logging and previews.
 */
export function maskPhone(rawOrPhone10: string | null | undefined): string {
  const phone10 = normalizePhone10(rawOrPhone10);
  if (!phone10) {
    return "******";
  }
  return `+91 ******${phone10.slice(-4)}`;
}
