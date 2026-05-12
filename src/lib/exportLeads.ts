import * as XLSX from "xlsx";
import { Lead } from "@/hooks/useLeads";
import { format } from "date-fns";

export interface ExportConfig {
  scope: "filtered" | "selected" | "all";
  format: "excel" | "csv" | "pdf";
  columns: string[];
  includeTaskStatus: boolean;
  includeLastFollowUp: boolean;
  includeTimestamp: boolean;
}

const columnLabels: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  status: "Status",
  assignedTo: "Assigned To",
  source: "Source",
  address: "Address",
  notes: "Notes",
  priority: "Priority",
  nextFollowUp: "Next Follow Up",
  createdDate: "Created Date",
  materials: "Materials",
  lastFollowUp: "Last Follow Up",
  designation: "Designation",
  firmName: "Firm Name",
  constructionStage: "Construction Stage",
  estimatedQuantity: "Estimated Quantity",
  createdBy: "Created By",
};

const priorityLabels: Record<number, string> = {
  1: "Very High",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Very Low",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function exportLeads(
  leads: Lead[],
  config: ExportConfig,
  taskData?: { [leadId: string]: { total: number; overdue: number; pending: number } }
): { fileName: string; rowCount: number; error?: string } {
  const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm-ss");
  const fileName = `leads_export_${timestamp}`;

  // Build rows
  const rows = leads.map((lead) => {
    const row: Record<string, any> = {};

    config.columns.forEach((col) => {
      switch (col) {
        case "name":
          row[columnLabels.name] = lead.name;
          break;
        case "phone":
          row[columnLabels.phone] = lead.phone;
          break;
        case "email":
          row[columnLabels.email] = lead.email || "";
          break;
        case "status":
          row[columnLabels.status] = lead.status;
          break;
        case "assignedTo":
          row[columnLabels.assignedTo] = lead.assigned_to;
          break;
        case "source":
          row[columnLabels.source] = lead.source;
          break;
        case "address":
          row[columnLabels.address] = lead.address || "";
          break;
        case "notes":
          row[columnLabels.notes] = lead.notes || "";
          break;
        case "priority":
          row[columnLabels.priority] = priorityLabels[lead.priority] || lead.priority;
          break;
        case "nextFollowUp":
          row[columnLabels.nextFollowUp] = lead.next_follow_up
            ? format(new Date(lead.next_follow_up), "MMM d, yyyy")
            : "";
          break;
        case "createdDate":
          row[columnLabels.createdDate] = format(new Date(lead.created_at), "MMM d, yyyy");
          break;
        case "materials":
          row[columnLabels.materials] = Array.isArray(lead.material_interests)
            ? (lead.material_interests as string[]).join(", ")
            : "";
          break;
        case "lastFollowUp":
          row[columnLabels.lastFollowUp] = lead.last_follow_up
            ? format(new Date(lead.last_follow_up), "MMM d, yyyy")
            : "";
          break;
        case "designation":
          row[columnLabels.designation] = lead.designation || "";
          break;
        case "firmName":
          row[columnLabels.firmName] = lead.firm_name || "";
          break;
        case "constructionStage":
          row[columnLabels.constructionStage] = lead.construction_stage || "";
          break;
        case "estimatedQuantity":
          row[columnLabels.estimatedQuantity] = lead.estimated_quantity || "";
          break;
        case "createdBy":
          row[columnLabels.createdBy] = lead.created_by || "";
          break;
      }
    });

    // Add task status if requested
    if (config.includeTaskStatus && taskData && taskData[lead.id]) {
      row["Task Status"] = `Total: ${taskData[lead.id].total}, Overdue: ${taskData[lead.id].overdue}`;
    }

    // Add last follow up if requested (separate from column selection)
    if (config.includeLastFollowUp && !config.columns.includes("lastFollowUp")) {
      row["Last Follow Up"] = lead.last_follow_up
        ? format(new Date(lead.last_follow_up), "MMM d, yyyy")
        : "";
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

  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

  // Auto-size columns
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] || "").length)),
  }));
  worksheet["!cols"] = colWidths;

  if (config.format === "pdf") {
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        return {
          fileName,
          rowCount: leads.length,
          error: "Popup blocked. Allow popups and try again.",
        };
      }
      const headers = Object.keys(rows[0] || {});
      const tableRows = rows
        .map(
          (row) =>
            `<tr>${headers
              .map(
                (h) =>
                  `<td style="border:1px solid #ddd;padding:6px 10px;font-size:12px">${escapeHtml(
                    row[h]
                  )}</td>`
              )
              .join("")}</tr>`
        )
        .join("");

      printWindow.document.write(`
        <!DOCTYPE html><html><head>
        <title>Leads Export</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h2 { color: #333; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #f5f5f5; border: 1px solid #ddd;
               padding: 8px 10px; text-align: left; font-size: 12px; }
          td { vertical-align: top; }
          @media print { button { display: none; } }
        </style></head><body>
        <h2>Leads Export — ${format(new Date(), "PPpp")}</h2>
        <table>
          <thead><tr>${headers
            .map((h) => `<th>${escapeHtml(h)}</th>`)
            .join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <br/>
        <button onclick="window.print()"
          style="padding:8px 16px;cursor:pointer">
          Print / Save as PDF
        </button>
        </body></html>`);
      printWindow.document.close();
      return { fileName, rowCount: leads.length };
    } catch (e) {
      console.error("[exportLeads] PDF failed:", e);
      return {
        fileName,
        rowCount: leads.length,
        error: "PDF generation failed.",
      };
    }
  }

  try {
    if (config.format === "csv") {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: "csv" });
    } else if (config.format === "excel") {
      XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: "xlsx" });
    }
  } catch (writeError) {
    console.error("[exportLeads] write failed:", writeError);
    return {
      fileName,
      rowCount: leads.length,
      error: "File download failed. Check browser download permissions.",
    };
  }

  return { fileName, rowCount: leads.length };
}
