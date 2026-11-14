/**
 * Server-side single-pass placeholder resolver & HMAC preview token signer (Sec 8.2 & 10.4).
 */

export const ALLOWED_PLACEHOLDER_KEYS = new Set([
  "name",
  "firm_name",
  "site_location",
  "site_map_link",
  "assigned_to",
  "showroom_name",
  "showroom_map_link",
  "quotation_number",
  "quotation_total",
  "valid_until",
]);

export interface PlaceholderContext {
  name?: string | null;
  firm_name?: string | null;
  site_location?: string | null;
  site_plus_code?: string | null;
  assigned_to?: string | null;
  showroom_name?: string | null;
  showroom_map_link?: string | null;
  quotation_number?: string | null;
  quotation_total?: string | null;
  valid_until?: string | null;
}

export interface RenderResult {
  ok: boolean;
  renderedText: string;
  blockedReasons: string[];
  resolvedValues: Record<string, string>;
  hasPlaceholders: boolean;
}

export function buildSiteMapLinkFromPlusCode(plusCode: string | null | undefined): string | null {
  if (typeof plusCode !== "string") return null;
  const trimmed = plusCode.trim();
  if (!trimmed) return null;
  // Full Open Location Code validation (at least 8 chars with '+' after 4-8 valid base20 chars)
  const clean = trimmed.toUpperCase();
  if (!/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,}$/.test(clean)) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
}

/**
 * Strips non-printable control characters while keeping newlines, tabs, and WhatsApp formatting.
 */
export function sanitizeMessageBody(raw: string): string {
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Single-pass server-side placeholder resolution (`{{key}}` or `{{key|fallback}}`).
 * Substituted values are never re-interpolated.
 */
export function renderTemplateForRecipient(
  template: string,
  ctx: PlaceholderContext,
  isBulk: boolean,
): RenderResult {
  const blockedReasons = new Set<string>();
  const resolvedValues: Record<string, string> = {};
  let hasPlaceholders = false;

  // Reject legacy single-brace syntax if someone typed {name} without double braces
  const strippedDouble = template.replace(/\{\{[^{}]*\}\}/g, "");
  if (/\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(strippedDouble)) {
    blockedReasons.add("PLACEHOLDER_UNRESOLVED");
  }

  const rendered = template.replace(/\{\{([^{}]+)\}\}/g, (_fullMatch, innerRaw: string) => {
    hasPlaceholders = true;
    const pipeIdx = innerRaw.indexOf("|");
    const key = (pipeIdx >= 0 ? innerRaw.slice(0, pipeIdx) : innerRaw).trim();
    const fallback = pipeIdx >= 0 ? innerRaw.slice(pipeIdx + 1).trim() : null;

    if (!ALLOWED_PLACEHOLDER_KEYS.has(key)) {
      blockedReasons.add("PLACEHOLDER_UNRESOLVED");
      return `{{${innerRaw}}}`;
    }

    if (key === "site_map_link") {
      const link = buildSiteMapLinkFromPlusCode(ctx.site_plus_code);
      if (link) {
        resolvedValues[key] = link;
        return link;
      }
      if (fallback && fallback.length > 0) {
        resolvedValues[key] = fallback;
        return fallback;
      }
      blockedReasons.add("SITE_PLUS_CODE_INVALID");
      return "";
    }

    const rawVal = (ctx as Record<string, string | null | undefined>)[key];
    const cleanVal = typeof rawVal === "string" ? rawVal.trim() : "";

    if (cleanVal.length > 0) {
      resolvedValues[key] = cleanVal;
      return cleanVal;
    }

    if (fallback !== null && fallback.length > 0) {
      resolvedValues[key] = fallback;
      return fallback;
    }

    blockedReasons.add("PLACEHOLDER_UNRESOLVED");
    return "";
  });

  const finalBody = sanitizeMessageBody(rendered);
  const maxLen = isBulk ? 1000 : 4000;
  if (finalBody.length > maxLen) {
    blockedReasons.add("MESSAGE_TOO_LONG");
  }

  return {
    ok: blockedReasons.size === 0,
    renderedText: finalBody,
    blockedReasons: Array.from(blockedReasons),
    resolvedValues,
    hasPlaceholders,
  };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PreviewTokenClaims {
  userId: string;
  requestId: string;
  slot: string;
  previewHash: string;
  expMs: number;
}

export async function signPreviewToken(
  secret: string,
  claims: PreviewTokenClaims,
): Promise<string> {
  const payload = `${claims.userId}|${claims.requestId}|${claims.slot}|${claims.previewHash}|${claims.expMs}`;
  const sig = await hmacSha256Hex(secret, payload);
  return `${claims.expMs}.${sig}`;
}

export async function verifyPreviewToken(
  secret: string,
  token: string,
  expected: Omit<PreviewTokenClaims, "expMs">,
  nowMs = Date.now(),
): Promise<{ valid: boolean; reason?: "PREVIEW_REQUIRED" | "PREVIEW_EXPIRED" }> {
  if (!token || !token.includes(".")) {
    return { valid: false, reason: "PREVIEW_REQUIRED" };
  }
  const [expStr, providedSig] = token.split(".", 2);
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || nowMs > expMs) {
    return { valid: false, reason: "PREVIEW_EXPIRED" };
  }

  const payload = `${expected.userId}|${expected.requestId}|${expected.slot}|${expected.previewHash}|${expMs}`;
  const expectedSig = await hmacSha256Hex(secret, payload);

  if (providedSig.length !== expectedSig.length) {
    return { valid: false, reason: "PREVIEW_REQUIRED" };
  }

  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  return diff === 0 ? { valid: true } : { valid: false, reason: "PREVIEW_REQUIRED" };
}