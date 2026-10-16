// Run with: deno test supabase/functions/customer-attachments/validation_test.ts
import { ALLOWED_MIME_TYPES, detectMimeType, MAX_FILE_BYTES, sanitizeFileName } from "./validation.ts";

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message ?? "values differ"}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

Deno.test("limits and allowed types", () => {
  assertEquals(MAX_FILE_BYTES, 10 * 1024 * 1024);
  assertEquals(ALLOWED_MIME_TYPES.join(","), "application/pdf,image/jpeg,image/png,image/webp");
});

Deno.test("detectMimeType recognises PDF, JPEG, PNG and WebP by signature", () => {
  assertEquals(detectMimeType(ascii("%PDF-1.7\n...")), "application/pdf");
  assertEquals(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)), "image/jpeg");
  assertEquals(detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), "image/png");
  const webp = new Uint8Array(16);
  webp.set(ascii("RIFF"), 0);
  webp.set(ascii("WEBP"), 8);
  assertEquals(detectMimeType(webp), "image/webp");
});

Deno.test("detectMimeType refuses everything else", () => {
  assertEquals(detectMimeType(ascii("just some plain text")), null);
  assertEquals(detectMimeType(new Uint8Array(0)), null);
  assertEquals(detectMimeType(bytes(0x4d, 0x5a, 0x90, 0x00)), null, "a Windows program must be refused");
  assertEquals(detectMimeType(ascii("<?php echo 1; ?>")), null);
});

Deno.test("detectMimeType: WebP needs both RIFF and WEBP", () => {
  const riffOnly = new Uint8Array(16);
  riffOnly.set(ascii("RIFF"), 0);
  riffOnly.set(ascii("WAVE"), 8);
  assertEquals(detectMimeType(riffOnly), null, "RIFF without WEBP (a WAV file) must be refused");
  const webpOnly = new Uint8Array(16);
  webpOnly.set(ascii("WEBP"), 8);
  assertEquals(detectMimeType(webpOnly), null, "WEBP without RIFF must be refused");
  assertEquals(detectMimeType(ascii("RIFF")), null, "too short");
});

Deno.test("sanitizeFileName strips folders", () => {
  assertEquals(sanitizeFileName("../../a.pdf"), "a.pdf");
  assertEquals(sanitizeFileName("C:\\x\\b.png"), "b.png");
  assertEquals(sanitizeFileName("/etc/passwd"), "passwd");
});

Deno.test("sanitizeFileName removes control, zero-width and direction-override characters", () => {
  assertEquals(sanitizeFileName("a\u0000b\u0007c.pdf"), "abc.pdf");
  assertEquals(sanitizeFileName("a\u200bb.pdf"), "ab.pdf");
  // A right-to-left override can make "gpj.exe" display as "exe.jpg".
  assertEquals(sanitizeFileName("invoice\u202egpj.exe"), "invoicegpj.exe");
});

Deno.test("sanitizeFileName trims and collapses whitespace", () => {
  assertEquals(sanitizeFileName("   my   scan \t copy .pdf  "), "my scan copy .pdf");
});

Deno.test("sanitizeFileName enforces 150 characters and keeps the extension", () => {
  const long = "x".repeat(300) + ".pdf";
  const result = sanitizeFileName(long);
  assertEquals(result.length, 150);
  assertEquals(result.endsWith(".pdf"), true);
  const noExtension = sanitizeFileName("y".repeat(400));
  assertEquals(noExtension.length, 150);
  const longExtension = sanitizeFileName("z".repeat(200) + "." + "e".repeat(40));
  assertEquals(longExtension.length, 150, "a very long 'extension' is cut like any other text");
});

Deno.test("sanitizeFileName returns 'file' for an empty result", () => {
  assertEquals(sanitizeFileName(""), "file");
  assertEquals(sanitizeFileName("   "), "file");
  assertEquals(sanitizeFileName("\u0000\u0001"), "file");
  assertEquals(sanitizeFileName("folder/"), "file");
});
