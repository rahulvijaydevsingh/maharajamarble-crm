import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  sanitizeStorageFileName,
  validateWhatsAppMediaFile,
  WHATSAPP_MAX_IMAGE_BYTES,
  WHATSAPP_MAX_PDF_BYTES,
} from "./whatsappMedia";
import { buildQuotationPdfBlob } from "./quotationPdf";
import {
  fetchSignedMediaBuffer,
  MAX_GATEWAY_IMAGE_BYTES,
  MAX_GATEWAY_PDF_BYTES,
} from "../../services/wa-gateway/src/runtime/mediaFetcher";

describe("Slice 1B Media & Quotation PDF Verification", () => {
  it("validates the supported PDF and image MIME types and size ceilings", () => {
    const validPdf = new Blob([new Uint8Array(1024)], { type: "application/pdf" });
    expect(validateWhatsAppMediaFile(validPdf, "quote.pdf")).toEqual({
      valid: true,
      mimeType: "application/pdf",
      messageType: "document",
    });
    const validImage = new Blob([new Uint8Array(128)], { type: "image/jpeg" });
    expect(validateWhatsAppMediaFile(validImage, "slab.jpg")).toMatchObject({ valid: true, messageType: "image" });
    const oversizedImg = new Blob([new Uint8Array(WHATSAPP_MAX_IMAGE_BYTES + 10)], { type: "image/jpeg" });
    expect(validateWhatsAppMediaFile(oversizedImg, "slab.jpg").valid).toBe(false);
    const oversizedPdf = new Blob([new Uint8Array(WHATSAPP_MAX_PDF_BYTES + 10)], { type: "application/pdf" });
    expect(validateWhatsAppMediaFile(oversizedPdf, "huge.pdf").valid).toBe(false);
    const executable = new Blob([new Uint8Array(100)], { type: "application/x-msdownload" });
    expect(validateWhatsAppMediaFile(executable, "malware.exe").valid).toBe(false);
    expect(validateWhatsAppMediaFile(new Blob([], { type: "application/pdf" }), "empty.pdf").valid).toBe(false);
  });

  it("sanitizes untrusted filenames while replacing path separators and unsafe punctuation", () => {
    expect(sanitizeStorageFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeStorageFileName("Quotation #QT-2026/01.pdf")).toBe("Quotation-QT-2026-01.pdf");
  });

  it("never emits consecutive dots, because Storage policies and enqueue reject them", () => {
    expect(sanitizeStorageFileName("Brochure..final.pdf")).toBe("Brochure.final.pdf");
    expect(sanitizeStorageFileName("scan....jpg")).toBe("scan.jpg");
    expect(sanitizeStorageFileName("...")).toBe("attachment");
    expect(sanitizeStorageFileName("..hidden.pdf")).toBe("hidden.pdf");
    for (const raw of ["a..b.pdf", "../x", "x/../y.pdf", "report...pdf", "..\\..\\win.pdf"]) {
      expect(sanitizeStorageFileName(raw)).not.toContain("..");
    }
  });

  it("keeps the file extension when a very long name is shortened", () => {
    const longName = sanitizeStorageFileName("a".repeat(150) + ".pdf");
    expect(longName.length).toBeLessThanOrEqual(100);
    expect(longName.endsWith(".pdf")).toBe(true);
  });

  it("generates a non-empty, in-memory quotation PDF Blob", async () => {
    const result = await buildQuotationPdfBlob({
      id: "00000000-0000-0000-0000-000000000101",
      quotation_number: "QT-2026-101",
      customer_name: "Rajesh Sharma",
      customer_phone: "9876543210",
      site_location: "Pakhowal Road, Ludhiana",
      assigned_to: "Nipun Tantia",
      total_amount: 145000,
      items: [{
        item_name: "Italian Statuario Marble",
        material_type: "Italian Marble",
        finish: "Polished",
        thickness: "18mm",
        quantity: 500,
        unit: "sq.ft",
        unit_price: 290,
        line_total: 145000,
      }],
    });
    expect(result.fileName).toBe("Maharaja-Marble-QT-2026-101.pdf");
    expect(result.blob.type).toBe("application/pdf");
    expect(result.byteSize).toBeGreaterThan(1000);
  });

  it("downloads signed media into a bounded Buffer", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": "3" },
    }));
    const buffer = await fetchSignedMediaBuffer("https://storage.example.test/object?token=abc", "application/pdf", { fetchImpl: fakeFetch });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(Array.from(buffer)).toEqual([1, 2, 3]);
    expect(MAX_GATEWAY_PDF_BYTES).toBe(16 * 1024 * 1024);
    expect(MAX_GATEWAY_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("verifies the registered SHA-256 after download when one is supplied", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const expected = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    const makeFetch = () => vi.fn().mockImplementation(() => Promise.resolve(new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })));
    const ok = await fetchSignedMediaBuffer("https://storage.example.test/object", "application/pdf", {
      fetchImpl: makeFetch(),
      expectedSha256: expected.toUpperCase(),
    });
    expect(Array.from(ok)).toEqual([1, 2, 3]);
    await expect(fetchSignedMediaBuffer("https://storage.example.test/object", "application/pdf", {
      fetchImpl: makeFetch(),
      expectedSha256: "0".repeat(64),
    })).rejects.toThrow("MEDIA_HASH_MISMATCH");
    const withoutHash = await fetchSignedMediaBuffer("https://storage.example.test/object", "application/pdf", {
      fetchImpl: makeFetch(),
      expectedSha256: null,
    });
    expect(withoutHash.length).toBe(3);
  });

  it("rejects streamed media beyond the configured size limit", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }));
    await expect(fetchSignedMediaBuffer("https://storage.example.test/object", "application/pdf", {
      fetchImpl: fakeFetch,
      maxBytes: 3,
    })).rejects.toThrow("MEDIA_TOO_LARGE");
  });

  it("rejects a stored MIME type that differs from the download response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(fetchSignedMediaBuffer("https://storage.example.test/object", "application/pdf", {
      fetchImpl: fakeFetch,
    })).rejects.toThrow("MEDIA_MIME_MISMATCH");
  });
});
