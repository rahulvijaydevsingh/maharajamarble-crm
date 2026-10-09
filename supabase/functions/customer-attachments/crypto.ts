// Envelope encryption helpers for customer attachments.
//
// Every file is encrypted with its own random key (the DEK, AES-256-GCM). The DEK is itself
// encrypted ("wrapped") with a root key (the KEK) that exists only as an Edge Function secret.
// Both encryptions are bound to the record with additional authenticated data (AAD), so a
// ciphertext can never be swapped between rows.
//
// This module uses only the Web Crypto API and has NO imports on purpose: its tests then run
// offline with a plain `deno test`.

const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION_PATTERN = /^[1-9][0-9]{0,8}$/;

export type Keks = { currentVersion: number; keys: Map<number, CryptoKey> };

// Newer TypeScript versions distinguish byte arrays backed by a SharedArrayBuffer from the ones the Web Crypto
// API accepts. Every array in this module is an ordinary one, so this cast only tells the type-checker so.
const buf = (bytes: Uint8Array): BufferSource => bytes as BufferSource;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// UTF-8 bytes of `${customerId}:${attachmentId}`.
export function buildAad(customerId: string, attachmentId: string): Uint8Array {
  return new TextEncoder().encode(`${customerId}:${attachmentId}`);
}

// Reads both secrets, validates them and imports every root key as NON-extractable.
// Any problem throws the same fixed message: no secret value, length or parsing detail is ever exposed.
export async function loadKeks(getEnv: (name: string) => string | undefined): Promise<Keks> {
  const fail = () => new Error("kek_config_invalid");

  const rawKeys = getEnv("CUSTOMER_ATTACHMENTS_KEKS");
  const rawCurrent = getEnv("CUSTOMER_ATTACHMENTS_KEK_CURRENT");
  if (!rawKeys || !rawCurrent) throw fail();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    throw fail();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw fail();

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw fail();

  const keys = new Map<number, CryptoKey>();
  for (const [versionText, value] of entries) {
    if (!VERSION_PATTERN.test(versionText) || typeof value !== "string") throw fail();
    let raw: Uint8Array;
    try {
      raw = fromBase64(value);
    } catch {
      throw fail();
    }
    // Must be exactly 32 bytes AND canonical base64 (so a typo cannot silently become another key).
    if (raw.length !== KEY_BYTES || toBase64(raw) !== value) throw fail();
    try {
      keys.set(
        Number(versionText),
        await crypto.subtle.importKey("raw", buf(raw), "AES-GCM", false, ["encrypt", "decrypt"]),
      );
    } catch {
      throw fail();
    } finally {
      raw.fill(0);
    }
  }

  const currentText = rawCurrent.trim();
  if (!VERSION_PATTERN.test(currentText)) throw fail();
  const currentVersion = Number(currentText);
  if (!keys.has(currentVersion)) throw fail();

  return { currentVersion, keys };
}

// A fresh random per-file key. Extractable only so that it can be wrapped.
export async function generateDek(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// Returns base64( iv || ciphertext ). Uses its own random IV and is bound to the AAD.
export async function wrapDek(dek: CryptoKey, kek: CryptoKey, aad: Uint8Array): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad) }, kek, buf(raw)),
    );
    const out = new Uint8Array(iv.length + sealed.length);
    out.set(iv, 0);
    out.set(sealed, iv.length);
    return toBase64(out);
  } finally {
    raw.fill(0);
  }
}

// Returns a NON-extractable AES-GCM key. Throws on any failure (wrong key, wrong AAD, tampering).
export async function unwrapDek(wrapped: string, kek: CryptoKey, aad: Uint8Array): Promise<CryptoKey> {
  const data = fromBase64(wrapped);
  if (data.length <= IV_BYTES) throw new Error("wrapped_key_invalid");
  const iv = data.slice(0, IV_BYTES);
  const sealed = data.slice(IV_BYTES);
  const raw = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad) }, kek, buf(sealed)),
  );
  try {
    return await crypto.subtle.importKey("raw", buf(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

// Re-encrypts a wrapped key under another root key (used when the root key is rotated).
// The per-file key is only ever held as raw bytes for the duration of this call and is wiped afterwards;
// no extractable key object is created. Returns base64( iv || ciphertext ) with a fresh IV.
export async function rewrapDek(
  wrapped: string,
  oldKek: CryptoKey,
  newKek: CryptoKey,
  aad: Uint8Array,
): Promise<string> {
  const data = fromBase64(wrapped);
  if (data.length <= IV_BYTES) throw new Error("wrapped_key_invalid");
  const oldIv = data.slice(0, IV_BYTES);
  const sealed = data.slice(IV_BYTES);
  const raw = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(oldIv), additionalData: buf(aad) }, oldKek, buf(sealed)),
  );
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const resealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad) }, newKek, buf(raw)),
    );
    const out = new Uint8Array(iv.length + resealed.length);
    out.set(iv, 0);
    out.set(resealed, iv.length);
    return toBase64(out);
  } finally {
    raw.fill(0);
  }
}

// The IV is returned as base64 (it is stored next to the wrapped key in the database).
export async function encryptFile(
  plain: Uint8Array,
  dek: CryptoKey,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad) }, dek, buf(plain)),
  );
  return { ciphertext, iv: toBase64(iv) };
}

// Throws on any tag, AAD or key failure.
export async function decryptFile(
  ciphertext: Uint8Array,
  iv: string,
  dek: CryptoKey,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const ivBytes = fromBase64(iv);
  if (ivBytes.length !== IV_BYTES) throw new Error("iv_invalid");
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(ivBytes), additionalData: buf(aad) }, dek, buf(ciphertext)),
  );
}
