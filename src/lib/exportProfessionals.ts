import * as XLSX from "xlsx";
import { Professional } from "@/hooks/useProfessionals";
import { format } from "date-fns";

export interface ExportConfig {
  scope: "filtered" | "selected" | "all";
  format: "excel" | "csv" | "pdf";
  columns: string[];
  includeTaskStatus: boolean;
  includeTimestamp: boolean;
}

const columnLabels: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  alternatePhone: "Alternate Phone",
  email: "Email",
  firmName: "Firm Name",
  professionalType: "Type",
  status: "Status",
  priority: "Priority",
  city: "City",
  address: "Address",
  assignedTo: "Assigned To",
  rating: "Rating",
  serviceCategory: "Service Category",
  notes: "Notes",
  createdAt: "Created Date",
};

const priorityLabels: Record<number, string> = {
  1: "Very High",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Very Low",
};

export function exportProfessionals(
  professionals: Professional[],
  config: ExportConfig,
  taskData?: { [professionalId: string]: { total: number; overdue: number; pending: number } }
) {
  const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm-ss");
  const fileName = `professionals_export_${timestamp}`;

  // Build rows
  const rows = professionals.map((professional) => {
    const row: Record<string, any> = {};

    config.columns.forEach((col) => {
      switch (col) {
        case "name":
          row[columnLabels.name] = professional.name;
          break;
        case "phone":
          row[columnLabels.phone] = professional.phone;
          break;
        case "alternatePhone":
          row[columnLabels.alternatePhone] = professional.alternate_phone || "";
          break;
        case "email":
          row[columnLabels.email] = professional.email || "";
          break;
        case "firmName":
          row[columnLabels.firmName] = professional.firm_name || "";
          break;
        case "professionalType":
          row[columnLabels.professionalType] = professional.professional_type;
          break;
        case "status":
          row[columnLabels.status] = professional.status;
          break;
        case "priority":
          row[columnLabels.priority] = priorityLabels[professional.priority] || professional.priority;
          break;
        case "city":
          row[columnLabels.city] = professional.city || "";
          break;
        case "address":
          row[columnLabels.address] = professional.address || "";
          break;
        case "assignedTo":
          row[columnLabels.assignedTo] = professional.assigned_to;
          break;
        case "rating":
          row[columnLabels.rating] = professional.rating?.toString() || "";
          break;
        case "serviceCategory":
          row[columnLabels.serviceCategory] = professional.service_category || "";
          break;
        case "notes":
          row[columnLabels.notes] = professional.notes || "";
          break;
        case "createdAt":
          row[columnLabels.createdAt] = format(new Date(professional.created_at), "MMM d, yyyy");
          break;
      }
    });

    // Add task status if requested
    if (config.includeTaskStatus && taskData && taskData[professional.id]) {
      row["Task Status"] = `Total: ${taskData[professional.id].total}, Overdue: ${taskData[professional.id].overdue}`;
    }

    return row;
  });

  // Add timestamp row if requested
  if (config.includeTimestamp) {
    rows.push({});
    rows.push({
      [columnLabels.name]: `Exported on: ${format(new Date(), "PPpp")}`,
    });
  }

  if (config.format === "pdf") {
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        return { fileName, rowCount: professionals.length,
                 error: "Popup blocked. Allow popups and try again." };
      }
      const headers = Object.keys(rows[0] || {});
      const tableRows = rows.map(row =>
        `<tr>${headers.map(h =>
          `<td style="border:1px solid #ddd;padding:6px 10px;font-size:12px">
            ${row[h] ?? ""}</td>`).join("")}</tr>`
      ).join("");

      printWindow.document.write(`
        <!DOCTYPE html><html><head>
        <title>Professionals Export</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h2 { color: #333; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #f5f5f5; border: 1px solid #ddd;
               padding: 8px 10px; text-align: left; font-size: 12px; }
          @media print { button { display: none; } }
        </style></head><body>
        <h2>Professionals Export — ${format(new Date(), "PPpp")}</h2>
        <table>
          <thead><tr>${headers.map(h =>
            `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <br/><button onclick="window.print()"
          style="padding:8px 16px;cursor:pointer">
          Print / Save as PDF</button>
        </body></html>`);
      printWindow.document.close();
      return { fileName, rowCount: professionals.length };
    } catch (e) {
      console.error("[export-pdf]", e);
      return { fileName, rowCount: professionals.length, error: "PDF generation failed." };
    }
  }

  try {
    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Professionals");

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] || "").length)),
    }));
    worksheet["!cols"] = colWidths;

    if (config.format === "csv") {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: "csv" });
    } else if (config.format === "excel") {
      XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: "xlsx" });
    }

    return { fileName, rowCount: professionals.length };
  } catch (e) {
    console.error("[export-excel/csv]", e);
    return { fileName, rowCount: professionals.length, error: "Export failed." };
  }
}
