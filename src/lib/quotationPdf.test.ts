import { describe, expect, it, vi } from "vitest";

const drawn = vi.hoisted(() => [] as Array<{ page: number; y: number; text: string }>);

vi.mock("html2canvas", () => ({ default: () => undefined }));
vi.mock("jspdf", async () => {
  const actual = await vi.importActual<typeof import("jspdf")>("jspdf");
  type TextFn = (text: string | string[], x: number, y: number, options?: unknown) => unknown;
  class SpyPdf extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      const target = this as unknown as { text: TextFn; getCurrentPageInfo: () => { pageNumber: number } };
      const original = target.text.bind(this);
      target.text = (text, x, y, options) => {
        const lines = Array.isArray(text) ? text : [String(text)];
        lines.forEach((line, index) => {
          drawn.push({ page: target.getCurrentPageInfo().pageNumber, y: Number(y) + index * 3.2, text: String(line) });
        });
        return original(text, x, y, options);
      };
    }
  }
  return { ...actual, jsPDF: SpyPdf };
});

import { createQuotationJsPdf, QUOTATION_PDF_COMPANY } from "./quotationPdf";

type PdfInput = Parameters<typeof createQuotationJsPdf>[0];

const quotationWith = (overrides: Record<string, unknown>): PdfInput => ({
  id: "q-1",
  quotation_number: "QT-2026-0001",
  created_at: "2026-11-17",
  customer_name: "Test Customer",
  customer_phone: "9876543210",
  subtotal: 800000,
  tax_amount: 144000,
  discount_amount: 0,
  freight_amount: 0,
  total_amount: 944000,
  items: Array.from({ length: 8 }, (_, index) => ({
    item_name: "Italian Marble " + (index + 1),
    description: "Polished, 18mm",
    quantity: 100,
    unit: "sq.ft",
    unit_price: 1000,
    line_total: 100000,
  })),
  ...overrides,
}) as PdfInput;

describe("WhatsApp quotation PDF", () => {
  it("prints the Mohali business identity and never the wrong city", () => {
    drawn.length = 0;
    createQuotationJsPdf(quotationWith({}));
    const text = drawn.map((entry) => entry.text).join("\n");
    expect(text).toContain(QUOTATION_PDF_COMPANY.name);
    expect(text).toContain("Mohali");
    expect(text).toContain(QUOTATION_PDF_COMPANY.gstin);
    expect(text).not.toContain("Ludhiana");
  });

  it("keeps every Terms clause and never draws below the footer reserve", () => {
    drawn.length = 0;
    const terms = Array.from({ length: 16 }, (_, index) =>
      (index + 1) + ". Clause " + (index + 1) + ": payment is due in full before dispatch; delivery timelines are indicative and subject to stock, transport and weather; breakage in transit is covered only if reported on the delivery challan at unloading; slabs are natural products and shade or veining variation is not a defect. [END" + (index + 1) + "]",
    ).join("\n");
    const doc = createQuotationJsPdf(quotationWith({ notes: "Note line.\n".repeat(6), terms_and_conditions: terms }));
    const pageHeight = doc.internal.pageSize.getHeight();
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const joined = drawn.map((entry) => entry.text).join(" ");
    for (let index = 1; index <= 16; index += 1) {
      expect(joined).toContain("[END" + index + "]");
    }
    const bodyLines = drawn.filter((entry) => /Clause|END\d+|Note line/.test(entry.text));
    expect(bodyLines.length).toBeGreaterThan(16);
    for (const entry of bodyLines) {
      expect(entry.y).toBeLessThanOrEqual(pageHeight - 18 + 0.001);
    }
  });

  it("draws a footer with the bank line and page numbers on every page", () => {
    drawn.length = 0;
    const doc = createQuotationJsPdf(quotationWith({ notes: "Note line.\n".repeat(60) }));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    const bankLines = drawn.filter((entry) => entry.text === QUOTATION_PDF_COMPANY.bank);
    expect(bankLines.length).toBe(pages);
    for (let page = 1; page <= pages; page += 1) {
      expect(drawn.some((entry) => entry.text === "Page " + page + " of " + pages)).toBe(true);
    }
  });
});
