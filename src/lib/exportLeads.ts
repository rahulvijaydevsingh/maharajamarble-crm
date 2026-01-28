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

export function exportLeads(
  leads: Lead[],
  config: ExportConfig,
  taskData?: { [leadId: string]: { total: number; overdue: number; pending: number } }
) {
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

  if (config.format === "csv") {
    XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: "csv" });
  } else if (config.format === "excel") {
    XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: "xlsx" });
  } else if (config.format === "pdf") {
    // For PDF, we'll export as CSV and show a message that PDF is not available
    // A proper PDF export would require a separate library like jspdf
    XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: "csv" });
  }

  return { fileName, rowCount: leads.length };
}
