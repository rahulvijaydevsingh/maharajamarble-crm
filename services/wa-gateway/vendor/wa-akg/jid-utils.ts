import type { ContactJidStore } from "../../src/ports/index";

const S_WHATSAPP_NET = "@s.whatsapp.net";

export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export function isStatusBroadcast(jid: string): boolean {
  return jid === "status@broadcast";
}

export function isNewsletterJid(jid: string): boolean {
  return jid.endsWith("@newsletter");
}

export function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

export function normalizeIndianPhoneToE164(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  let phone10: string | null = null;

  if (digits.length === 10) {
    phone10 = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    phone10 = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    phone10 = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith("0091")) {
    phone10 = digits.slice(4);
  }

  if (!phone10 || !/^[6-9][0-9]{9}$/.test(phone10)) {
    return null;
  }

  return `91${phone10}`;
}

export function formatPhoneToJid(
  rawPhone: string,
  contactStore?: ContactJidStore,
): string {
  if (rawPhone.includes("@s.whatsapp.net") || rawPhone.includes("@lid")) {
    return rawPhone.trim();
  }

  const e164 = normalizeIndianPhoneToE164(rawPhone);
  if (!e164) {
    throw new Error(`PHONE_INVALID: Cannot convert "${rawPhone}" to Indian WhatsApp JID`);
  }

  const phone10 = e164.slice(2);
  const cached = contactStore?.getResolvedJid(phone10);
  if (cached) {
    return cached;
  }

  return `${e164}${S_WHATSAPP_NET}`;
}

export function extractPhoneE164FromJid(jid: string | undefined | null): string | null {
  if (!jid || isGroupJid(jid) || isStatusBroadcast(jid) || isNewsletterJid(jid) || isLidJid(jid)) {
    return null;
  }
  const userPart = jid.split("@")[0]?.split(":")[0] ?? "";
  return normalizeIndianPhoneToE164(userPart);
}
