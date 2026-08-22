import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface DownloadQuotationPdfOptions {
  element: HTMLElement;
  fileName: string;
}

export async function downloadQuotationPdf({
  element,
  fileName,
}: DownloadQuotationPdfOptions) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const imageHeight = (canvas.height * printableWidth) / canvas.width;
  const image = canvas.toDataURL('image/jpeg', 0.98);

  let heightLeft = imageHeight;
  let offsetY = margin;

  pdf.addImage(image, 'JPEG', margin, offsetY, printableWidth, imageHeight);
  heightLeft -= printableHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    offsetY = margin - (imageHeight - heightLeft);
    pdf.addImage(image, 'JPEG', margin, offsetY, printableWidth, imageHeight);
    heightLeft -= printableHeight;
  }

  pdf.save(fileName);
}