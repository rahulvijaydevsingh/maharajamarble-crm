import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
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
    expect(sanitizeStorageFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(sanitizeStorageFileName("Quotation #QT-2026/01.pdf")).toBe("Quotation-QT-2026-01.pdf");
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
