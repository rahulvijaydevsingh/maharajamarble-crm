// Run with: deno test supabase/functions/customer-attachments/crypto_test.ts
// All keys are generated inside the tests; nothing here is a real or reusable key.
import {
  buildAad,
  decryptFile,
  encryptFile,
  fromBase64,
  generateDek,
  loadKeks,
  rewrapDek,
  toBase64,
  unwrapDek,
  wrapDek,
} from "./crypto.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function assertRejects(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(message);
}

function randomKeyBase64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

async function makeKek(): Promise<CryptoKey> {
  const keys = await loadKeks((name) =>
    name === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": randomKeyBase64() }) : "1"
  );
  return keys.keys.get(1)!;
}

const customerId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const aad = buildAad(customerId, attachmentId);
const sampleFile = new TextEncoder().encode("%PDF-1.7 pretend this is a customer's identity document");

Deno.test("buildAad is the UTF-8 bytes of customer:attachment", () => {
  assert(new TextDecoder().decode(aad) === `${customerId}:${attachmentId}`, "unexpected aad");
});

Deno.test("1. encrypt then decrypt round-trips a file", async () => {
  const kek = await makeKek();
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptFile(sampleFile, dek, aad);
  const wrapped = await wrapDek(dek, kek, aad);
  const unwrapped = await unwrapDek(wrapped, kek, aad);
  const plain = await decryptFile(ciphertext, iv, unwrapped, aad);
  assert(new TextDecoder().decode(plain) === new TextDecoder().decode(sampleFile), "round trip changed the file");
  assert(ciphertext.length === sampleFile.length + 16, "ciphertext should be plaintext plus a 16-byte tag");
  assert(new TextDecoder().decode(ciphertext).indexOf("identity document") === -1, "ciphertext must not contain the plaintext");
});

Deno.test("2. a tampered ciphertext fails", async () => {
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptFile(sampleFile, dek, aad);
  ciphertext[5] ^= 0x01;
  await assertRejects(decryptFile(ciphertext, iv, dek, aad), "tampered ciphertext was accepted");
});

Deno.test("3. a wrong AAD fails (ciphertext cannot be moved to another row)", async () => {
  const kek = await makeKek();
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptFile(sampleFile, dek, aad);
  const otherAad = buildAad(customerId, "33333333-3333-4333-8333-333333333333");
  await assertRejects(decryptFile(ciphertext, iv, dek, otherAad), "file decrypted under a different aad");
  const wrapped = await wrapDek(dek, kek, aad);
  await assertRejects(unwrapDek(wrapped, kek, otherAad), "key unwrapped under a different aad");
});

Deno.test("4. a wrong root key cannot unwrap", async () => {
  const kek = await makeKek();
  const otherKek = await makeKek();
  const dek = await generateDek();
  const wrapped = await wrapDek(dek, kek, aad);
  await assertRejects(unwrapDek(wrapped, otherKek, aad), "a different root key unwrapped the key");
});

Deno.test("5. re-wrapping with a new root key keeps the file readable", async () => {
  const oldKek = await makeKek();
  const newKek = await makeKek();
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptFile(sampleFile, dek, aad);
  const wrappedOld = await wrapDek(dek, oldKek, aad);

  const wrappedNew = await rewrapDek(wrappedOld, oldKek, newKek, aad);

  assert(wrappedNew !== wrappedOld, "re-wrap returned the same value");
  await assertRejects(unwrapDek(wrappedNew, oldKek, aad), "old root key still opens the re-wrapped key");
  const again = await unwrapDek(wrappedNew, newKek, aad);
  const plain = await decryptFile(ciphertext, iv, again, aad);
  assert(new TextDecoder().decode(plain) === new TextDecoder().decode(sampleFile), "file unreadable after re-wrap");
});

Deno.test("5a. re-wrap fails with the wrong old root key or the wrong aad", async () => {
  const oldKek = await makeKek();
  const wrongKek = await makeKek();
  const newKek = await makeKek();
  const dek = await generateDek();
  const wrappedOld = await wrapDek(dek, oldKek, aad);
  await assertRejects(rewrapDek(wrappedOld, wrongKek, newKek, aad), "re-wrap accepted the wrong old key");
  await assertRejects(
    rewrapDek(wrappedOld, oldKek, newKek, buildAad(customerId, "44444444-4444-4444-8444-444444444444")),
    "re-wrap accepted the wrong aad",
  );
});

Deno.test("5b. the unwrapped key is not extractable", async () => {
  const kek = await makeKek();
  const dek = await generateDek();
  const unwrapped = await unwrapDek(await wrapDek(dek, kek, aad), kek, aad);
  assert(unwrapped.extractable === false, "unwrapped key must not be extractable");
});

Deno.test("6. loadKeks accepts a valid configuration", async () => {
  const keys = await loadKeks((name) =>
    name === "CUSTOMER_ATTACHMENTS_KEKS"
      ? JSON.stringify({ "1": randomKeyBase64(), "2": randomKeyBase64() })
      : name === "CUSTOMER_ATTACHMENTS_KEK_CURRENT"
      ? "2"
      : undefined
  );
  assert(keys.currentVersion === 2 && keys.keys.size === 2, "valid configuration not loaded");
  assert(keys.keys.get(2)!.extractable === false, "root keys must not be extractable");
});

Deno.test("6. loadKeks rejects every broken configuration with the same fixed message", async () => {
  const good = randomKeyBase64();
  const cases: Record<string, (name: string) => string | undefined> = {
    "missing both secrets": () => undefined,
    "missing current": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": good }) : undefined),
    "missing keys": (n) => (n === "CUSTOMER_ATTACHMENTS_KEK_CURRENT" ? "1" : undefined),
    "invalid JSON": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? "{not json" : "1"),
    "JSON array": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify([good]) : "1"),
    "empty map": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? "{}" : "1"),
    "key too short": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": toBase64(new Uint8Array(16)) }) : "1"),
    "key too long": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": toBase64(new Uint8Array(33)) }) : "1"),
    "key not base64": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": "***not-base64***" }) : "1"),
    "key not a string": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": 12345 }) : "1"),
    "bad version name": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "v1": good }) : "1"),
    "zero version": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "0": good }) : "0"),
    "current not in map": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": good }) : "2"),
    "current not a number": (n) => (n === "CUSTOMER_ATTACHMENTS_KEKS" ? JSON.stringify({ "1": good }) : "one"),
  };
  for (const [name, getEnv] of Object.entries(cases)) {
    let message = "";
    try {
      await loadKeks(getEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    assert(message === "kek_config_invalid", `case "${name}" should fail with the fixed message but gave "${message}"`);
  }
});

Deno.test("7. encrypting the same file twice gives different ciphertext and IVs", async () => {
  const dek = await generateDek();
  const first = await encryptFile(sampleFile, dek, aad);
  const second = await encryptFile(sampleFile, dek, aad);
  assert(first.iv !== second.iv, "IV was reused");
  assert(toBase64(first.ciphertext) !== toBase64(second.ciphertext), "ciphertext repeated");
});

Deno.test("two wraps of the same key differ (fresh IV each time)", async () => {
  const kek = await makeKek();
  const dek = await generateDek();
  assert((await wrapDek(dek, kek, aad)) !== (await wrapDek(dek, kek, aad)), "wrap repeated");
});

Deno.test("base64 helpers round-trip large and binary data", () => {
  const data = crypto.getRandomValues(new Uint8Array(60_000));
  const back = fromBase64(toBase64(data));
  assert(back.length === data.length && back.every((v, i) => v === data[i]), "base64 round trip failed");
});
