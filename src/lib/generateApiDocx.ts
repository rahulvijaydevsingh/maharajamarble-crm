import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

interface Endpoint {
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  bodyFields?: { name: string; type: string; required: boolean; description: string }[];
  exampleResponse: string;
}

function makeHeaderCell(text: string) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: "Calibri" })] })],
    shading: { fill: "E2E8F0" },
  });
}

function makeCell(text: string) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "Calibri" })] })],
  });
}

function buildParamTable(fields: { name: string; type: string; required: boolean; description: string }[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [
      new TableRow({ children: [makeHeaderCell("Name"), makeHeaderCell("Type"), makeHeaderCell("Required"), makeHeaderCell("Description")] }),
      ...fields.map(
        (f) =>
          new TableRow({
            children: [makeCell(f.name), makeCell(f.type), makeCell(f.required ? "Yes" : "No"), makeCell(f.description)],
          })
      ),
    ],
  });
}

export async function generateApiDocx(
  baseUrl: string,
  endpoints: Record<string, Endpoint[]>
) {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "Maharaja Marble CRM — API Documentation", bold: true, size: 36, font: "Calibri" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, italics: true, size: 20, font: "Calibri", color: "666666" })],
    }),
    new Paragraph({ children: [] })
  );

  // Auth section
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Authentication", bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: "All requests require a Bearer token:", size: 22, font: "Calibri" })] }),
    new Paragraph({ children: [new TextRun({ text: "Authorization: Bearer mmcrm_YOUR_KEY_HERE", size: 22, font: "Courier New" })] }),
    new Paragraph({ children: [new TextRun({ text: `Base URL: ${baseUrl}`, size: 22, font: "Courier New" })] }),
    new Paragraph({ children: [new TextRun({ text: "Rate limit: 200 requests/hour per key.", size: 20, font: "Calibri", color: "666666" })] }),
    new Paragraph({ children: [] })
  );

  // Endpoints by section
  for (const [section, eps] of Object.entries(endpoints)) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: section, bold: true })] })
    );

    for (const ep of eps) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: `${ep.method} `, bold: true, color: ep.method === "GET" ? "16A34A" : ep.method === "POST" ? "2563EB" : ep.method === "DELETE" ? "DC2626" : "D97706" }),
            new TextRun({ text: ep.path, font: "Courier New" }),
          ],
        }),
        new Paragraph({ children: [new TextRun({ text: ep.description, size: 22, font: "Calibri" })] })
      );

      if (ep.params?.length) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Query Parameters", bold: true, size: 22 })] }),
          buildParamTable(ep.params)
        );
      }

      if (ep.bodyFields?.length) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Request Body", bold: true, size: 22 })] }),
          buildParamTable(ep.bodyFields)
        );
      }

      // Example response
      let formatted: string;
      try {
        formatted = JSON.stringify(JSON.parse(ep.exampleResponse), null, 2);
      } catch {
        formatted = ep.exampleResponse;
      }
      children.push(
        new Paragraph({ children: [new TextRun({ text: "Example Response:", bold: true, size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: formatted, size: 18, font: "Courier New" })] }),
        new Paragraph({ children: [] })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
    creator: "Maharaja Marble CRM",
    description: "API Documentation",
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `CRM_API_Documentation_${new Date().toISOString().slice(0, 10)}.docx`);
}
