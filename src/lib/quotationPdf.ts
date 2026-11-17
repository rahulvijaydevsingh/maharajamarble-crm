import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface QuotationLineItemPdfInput {
  id?: string;
  item_name?: string;
  description?: string | null;
  material_type?: string | null;
  finish?: string | null;
  thickness?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  tax_percent?: number | null;
  discount_percent?: number | null;
  line_total?: number | null;
}

export interface QuotationPdfInput {
  id: string;
  quotation_number: string;
  created_at?: string | null;
  valid_until?: string | null;
  status?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  site_location?: string | null;
  site_plus_code?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  freight_amount?: number | null;
  total_amount: number;
  notes?: string | null;
  terms_and_conditions?: string | null;
  items: QuotationLineItemPdfInput[];
}

export interface BuiltQuotationPdfResult {
  blob: Blob;
  fileName: string;
  byteSize: number;
}

export interface DownloadQuotationPdfOptions {
  element: HTMLElement;
  fileName: string;
}

function formatInr(amount: number | null | undefined): string {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric)) return "Rs. 0.00";
  return "Rs. " + numeric.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeQuotationFileName(quotationNumber: string): string {
  const safe = (quotationNumber || "Quotation")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  return "Maharaja-Marble-" + (safe || "Quotation") + ".pdf";
}

function dateLabel(value?: string | null): string {
  if (!value) return new Date().toLocaleDateString("en-IN");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN");
}

function drawPageHeader(doc: jsPDF, quotation: QuotationPdfInput): void {
  doc.setFillColor(26, 26, 46);
  doc.rect(0, 0, 210, 36, "F");
  doc.setFillColor(201, 168, 76);
  doc.rect(0, 36, 210, 2.2, "F");

  doc.setTextColor(201, 168, 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("MAHARAJA MARBLE & GRANITE", 13, 15);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Premium Marble, Granite, Quartz & Natural Stone Solutions", 13, 22);
  doc.text("Ludhiana, Punjab, India", 13, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(201, 168, 76);
  doc.text("QUOTATION", 197, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("No: " + quotation.quotation_number, 197, 22, { align: "right" });
  doc.text("Date: " + dateLabel(quotation.created_at), 197, 28, { align: "right" });
}

function addWrappedText(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  lineHeight = 4.2,
): number {
  const lines = doc.splitTextToSize(value, width) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function createQuotationJsPdf(quotation: QuotationPdfInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 13;
  const right = pageWidth - 13;
  const usable = right - left;

  drawPageHeader(doc, quotation);
  let y = 46;

  doc.setTextColor(26, 26, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Prepared For", left, y);
  doc.text("Quotation Details", 118, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y = addWrappedText(doc, quotation.customer_name || "Valued Customer", left, y, 94);
  if (quotation.customer_phone) {
    y = addWrappedText(doc, "Phone: " + quotation.customer_phone, left, y + 1, 94);
  }
  const address = quotation.site_location || quotation.customer_address;
  if (address) {
    y = addWrappedText(doc, "Site / Address: " + address, left, y + 1, 94);
  }

  let detailsY = 52;
  doc.text(
    "Valid Until: " + (quotation.valid_until ? dateLabel(quotation.valid_until) : "15 Days from Issue"),
    118,
    detailsY,
  );
  detailsY += 5;
  doc.text("Sales Consultant: " + (quotation.assigned_to || quotation.created_by || "Maharaja Marble Team"), 118, detailsY);
  detailsY += 5;
  if (quotation.status) doc.text("Status: " + quotation.status, 118, detailsY);

  y = Math.max(y, detailsY) + 7;

  const columns = [
    { x: left, width: 10, title: "#" },
    { x: left + 10, width: 75, title: "Material & Specification" },
    { x: left + 85, width: 25, title: "Qty / Unit" },
    { x: left + 110, width: 31, title: "Rate" },
    { x: left + 141, width: usable - 141, title: "Amount" },
  ];
  const rowHeight = 8;

  const drawTableHeader = () => {
    doc.setFillColor(26, 26, 46);
    doc.rect(left, y - 5, usable, rowHeight, "F");
    doc.setTextColor(201, 168, 76);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    columns.forEach((column, index) => {
      const textX = index === 4 ? column.x + column.width - 2 : column.x + 2;
      doc.text(column.title, textX, y, { align: index === 4 ? "right" : "left" });
    });
    y += 7;
  };

  drawTableHeader();
  doc.setFont("helvetica", "normal");
  doc.setTextColor(26, 26, 46);
  doc.setFontSize(7.8);

  const items = quotation.items ?? [];
  const rows: QuotationLineItemPdfInput[] = items.length > 0 ? items : [{
    item_name: "As per showroom selection",
    quantity: 1,
    unit: "Lot",
    unit_price: Number(quotation.total_amount || 0),
    line_total: Number(quotation.total_amount || 0),
  }];

  rows.forEach((item, index) => {
    const specs: string[] = [];
    if (item.material_type) specs.push(item.material_type);
    if (item.finish) specs.push("Finish: " + item.finish);
    if (item.thickness) specs.push("Thickness: " + item.thickness);
    if (item.description) specs.push(item.description);
    const title = item.item_name || "Marble / Stone Selection";
    const description = specs.length ? title + "\n" + specs.join(" · ") : title;
    const descLines = doc.splitTextToSize(description, 71) as string[];
    const actualAmount = item.line_total != null
      ? Number(item.line_total)
      : Number(item.quantity || 0) * Number(item.unit_price || 0) *
        (1 - Number(item.discount_percent || 0) / 100);
    const height = Math.max(9, descLines.length * 3.8 + 4);

    if (y + height > pageHeight - 34) {
      doc.addPage();
      drawPageHeader(doc, quotation);
      y = 50;
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setTextColor(26, 26, 46);
      doc.setFontSize(7.8);
    }

    doc.setDrawColor(215, 218, 224);
    doc.line(left, y + height - 2, right, y + height - 2);
    doc.text(String(index + 1), columns[0].x + 2, y + 3);
    doc.text(descLines, columns[1].x + 2, y + 3);
    const quantityLabel = String(Number(item.quantity || 0)) + " " + (item.unit || "sq.ft");
    doc.text(quantityLabel, columns[2].x + columns[2].width - 2, y + 3, { align: "right" });
    doc.text(formatInr(item.unit_price), columns[3].x + columns[3].width - 2, y + 3, { align: "right" });
    doc.text(formatInr(actualAmount), right - 1, y + 3, { align: "right" });
    y += height;
  });

  y += 6;
  if (y > pageHeight - 62) {
    doc.addPage();
    drawPageHeader(doc, quotation);
    y = 49;
  }

  const subtotal = Number(quotation.subtotal ?? quotation.total_amount ?? 0);
  const discount = Number(quotation.discount_amount ?? 0);
  const freight = Number(quotation.freight_amount ?? 0);
  const tax = Number(quotation.tax_amount ?? 0);
  const total = Number(quotation.total_amount ?? subtotal - discount + tax);
  const totalX = right - 58;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(55, 65, 81);
  doc.text("Subtotal:", totalX, y);
  doc.text(formatInr(subtotal), right, y, { align: "right" });
  y += 5;
  if (freight > 0) {
    doc.text("Freight:", totalX, y);
    doc.text(formatInr(freight), right, y, { align: "right" });
    y += 5;
  }
  if (discount > 0) {
    doc.text("Discount:", totalX, y);
    doc.text("- " + formatInr(discount), right, y, { align: "right" });
    y += 5;
  }
  if (tax > 0) {
    doc.text("GST / Tax:", totalX, y);
    doc.text(formatInr(tax), right, y, { align: "right" });
    y += 5;
  }

  y += 2;
  doc.setFillColor(26, 26, 46);
  doc.rect(totalX - 3, y - 4, right - totalX + 3, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(201, 168, 76);
  doc.text("Grand Total:", totalX, y + 1.5);
  doc.text(formatInr(total), right - 1, y + 1.5, { align: "right" });
  y += 14;

  doc.setTextColor(26, 26, 46);
  if (quotation.notes) {
    if (y > pageHeight - 30) {
      doc.addPage();
      drawPageHeader(doc, quotation);
      y = 49;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes:", left, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y = addWrappedText(doc, quotation.notes, left, y, usable, 3.8) + 4;
  }

  const terms = quotation.terms_and_conditions ||
    "1. Natural marble and granite are products of nature and may vary in shade, veining and texture.\n2. Measurements and applicable taxes are confirmed at dispatch.";
  if (y > pageHeight - 24) {
    doc.addPage();
    drawPageHeader(doc, quotation);
    y = 49;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Terms & Conditions:", left, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  addWrappedText(doc, terms, left, y, usable, 3.5);

  return doc;
}

export async function buildQuotationPdfBlob(
  quotation: QuotationPdfInput,
): Promise<BuiltQuotationPdfResult> {
  const doc = createQuotationJsPdf(quotation);
  const blob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
  const fileName = sanitizeQuotationFileName(quotation.quotation_number);
  return { blob, fileName, byteSize: blob.size };
}

export const buildQuotationPdf = buildQuotationPdfBlob;

async function downloadExistingTemplatePdf(options: DownloadQuotationPdfOptions): Promise<void> {
  const canvas = await html2canvas(options.element, {
    backgroundColor: "#ffffff",
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const imageHeight = (canvas.height * printableWidth) / canvas.width;
  const image = canvas.toDataURL("image/jpeg", 0.98);

  let heightLeft = imageHeight;
  let offsetY = margin;
  pdf.addImage(image, "JPEG", margin, offsetY, printableWidth, imageHeight);
  heightLeft -= printableHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    offsetY = margin - (imageHeight - heightLeft);
    pdf.addImage(image, "JPEG", margin, offsetY, printableWidth, imageHeight);
    heightLeft -= printableHeight;
  }
  pdf.save(options.fileName);
}

export function downloadQuotationPdf(options: DownloadQuotationPdfOptions): Promise<void>;
export function downloadQuotationPdf(quotation: QuotationPdfInput): string;
export function downloadQuotationPdf(
  input: DownloadQuotationPdfOptions | QuotationPdfInput,
): Promise<void> | string {
  if ("element" in input) return downloadExistingTemplatePdf(input);
  const doc = createQuotationJsPdf(input);
  const fileName = sanitizeQuotationFileName(input.quotation_number);
  doc.save(fileName);
  return fileName;
}
