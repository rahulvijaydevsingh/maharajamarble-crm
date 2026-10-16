import { supabase } from "@/integrations/supabase/client";

export const CUSTOMER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"];
export const CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export type CustomerAttachmentErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "file_too_large"
  | "unsupported_type"
  | "server_error"
  | "network";

export class CustomerAttachmentError extends Error {
  code: CustomerAttachmentErrorCode;

  constructor(code: CustomerAttachmentErrorCode, message?: string) {
    const defaultMessage = getCustomerAttachmentErrorMessage(code);
    super(message || defaultMessage);
    this.name = "CustomerAttachmentError";
    this.code = code;
  }
}

export function getCustomerAttachmentErrorMessage(
  code: CustomerAttachmentErrorCode,
): string {
  switch (code) {
    case "forbidden":
      return "You do not have permission to do that.";
    case "file_too_large":
      return "This file is larger than 10 MB.";
    case "unsupported_type":
      return "Only PDF, JPG, PNG and WebP files are allowed.";
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export interface SecureAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_name: string | null;
  created_at: string;
  from_lead: boolean;
}

export interface LeadImportSummary {
  imported: number;
  alreadyImported: number;
  skipped: { fileName: string; reason: string }[];
  failed: boolean;
}

async function extractErrorCode(error: unknown): Promise<CustomerAttachmentErrorCode> {
  if (!error) return "server_error";
  try {
    const contextResponse = (error as { context?: Response }).context;
    if (contextResponse && typeof contextResponse.json === "function") {
      const body = await contextResponse.json().catch(() => null);
      if (body && typeof body.error === "string") {
        const code = body.error as CustomerAttachmentErrorCode;
        if (
          [
            "invalid_request",
            "unauthorized",
            "forbidden",
            "file_too_large",
            "unsupported_type",
            "server_error",
          ].includes(code)
        ) {
          return code;
        }
      }
    }
  } catch {
    // ignore parse failure
  }
  if (
    error instanceof TypeError ||
    (error as Error)?.name === "FetchError" ||
    (error as Error)?.message?.toLowerCase().includes("failed to fetch")
  ) {
    return "network";
  }
  return "server_error";
}

export async function uploadCustomerAttachment(
  customerId: string,
  file: File,
): Promise<{ id: string; file_name: string; file_size: number; mime_type: string }> {
  const formData = new FormData();
  formData.append("action", "upload");
  formData.append("customer_id", customerId);
  formData.append("file", file);

  const { data, error } = await supabase.functions.invoke("customer-attachments", {
    body: formData,
  });

  if (error) {
    const code = await extractErrorCode(error);
    throw new CustomerAttachmentError(code);
  }

  return data as { id: string; file_name: string; file_size: number; mime_type: string };
}

export async function listCustomerAttachments(
  customerId: string,
): Promise<SecureAttachment[]> {
  const { data, error } = await supabase.functions.invoke("customer-attachments", {
    body: { action: "list", customer_id: customerId },
  });

  if (error) {
    const code = await extractErrorCode(error);
    throw new CustomerAttachmentError(code);
  }

  return (data as { attachments: SecureAttachment[] })?.attachments ?? [];
}

export async function renameCustomerAttachment(
  attachmentId: string,
  fileName: string,
): Promise<{ id: string; file_name: string }> {
  const { data, error } = await supabase.functions.invoke("customer-attachments", {
    body: { action: "rename", attachment_id: attachmentId, file_name: fileName },
  });

  if (error) {
    const code = await extractErrorCode(error);
    throw new CustomerAttachmentError(code);
  }

  return data as { id: string; file_name: string };
}

export async function deleteCustomerAttachment(
  attachmentId: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke("customer-attachments", {
    body: { action: "delete", attachment_id: attachmentId },
  });

  if (error) {
    const code = await extractErrorCode(error);
    throw new CustomerAttachmentError(code);
  }

  return data as { id: string };
}

export async function downloadCustomerAttachment(
  attachmentId: string,
): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke("customer-attachments", {
    body: { action: "download", attachment_id: attachmentId },
  });

  if (error) {
    const code = await extractErrorCode(error);
    throw new CustomerAttachmentError(code);
  }

  if (data instanceof Blob) {
    return data;
  }

  throw new CustomerAttachmentError("server_error");
}

export async function importLeadFiles(
  leadId: string,
  customerId: string,
): Promise<LeadImportSummary> {
  const summary: LeadImportSummary = {
    imported: 0,
    alreadyImported: 0,
    skipped: [],
    failed: false,
  };

  let offset: number | null = 0;
  let calls = 0;
  const maxCalls = 40;

  while (offset !== null && calls < maxCalls) {
    calls++;
    try {
      const { data, error } = await supabase.functions.invoke("customer-attachments", {
        body: {
          action: "import_lead_files",
          lead_id: leadId,
          customer_id: customerId,
          offset,
        },
      });

      if (error) {
        summary.failed = true;
        break;
      }

      const res = data as {
        imported: number;
        already_imported: number;
        skipped: { file_name: string; reason: string }[];
        next_offset: number | null;
      };

      if (!res) {
        summary.failed = true;
        break;
      }

      summary.imported += res.imported ?? 0;
      summary.alreadyImported += res.already_imported ?? 0;
      if (Array.isArray(res.skipped)) {
        for (const item of res.skipped) {
          summary.skipped.push({
            fileName: item.file_name,
            reason: item.reason,
          });
        }
      }

      offset = res.next_offset ?? null;
    } catch {
      summary.failed = true;
      break;
    }
  }

  if (offset !== null) {
    summary.failed = true;
  }

  return summary;
}
