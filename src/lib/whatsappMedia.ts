import { supabase } from "@/integrations/supabase/client";

export const WHATSAPP_MEDIA_BUCKET = "crm-attachments" as const;
export const WHATSAPP_MAX_PDF_BYTES = 16 * 1024 * 1024;
export const WHATSAPP_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_LIBRARY_QUOTA_BYTES = 350 * 1024 * 1024;

export const ALLOWED_WHATSAPP_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedWhatsAppMimeType = (typeof ALLOWED_WHATSAPP_MIME_TYPES)[number];
export type WhatsAppLibraryCategory = "catalogue" | "material_image" | "price_list" | "other";

export interface WhatsAppStagingMediaRef {
  kind: "staging";
  bucket: typeof WHATSAPP_MEDIA_BUCKET;
  path: string;
  mime_type: AllowedWhatsAppMimeType;
  file_name: string;
  byte_size: number;
}

export interface WhatsAppLibraryMediaRef {
  kind: "library";
  library_item_id: string;
  bucket: typeof WHATSAPP_MEDIA_BUCKET;
  path: string;
  mime_type: AllowedWhatsAppMimeType;
  file_name: string;
  byte_size: number;
  title?: string;
  category?: WhatsAppLibraryCategory;
}

export type WhatsAppMediaRef = WhatsAppStagingMediaRef | WhatsAppLibraryMediaRef;

export interface WhatsAppLibraryItemRow {
  id: string;
  title: string;
  description: string | null;
  kind: "catalogue" | "image" | "document";
  bucket: string;
  path: string | null;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  sha256: string | null;
  external_url: string | null;
  active: boolean;
  created_by: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export function sanitizeStorageFileName(rawName: string): string {
  const trimmed = (rawName || "attachment").trim();
  // Storage policies and whatsapp-enqueue both reject any ".." or "//" in an object name,
  // so consecutive dots are collapsed instead of being passed through.
  const safe = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (safe.length <= 100) return safe || "attachment";
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 && safe.length - dot <= 8 ? safe.slice(dot) : "";
  const base = extension ? safe.slice(0, dot) : safe;
  return base.slice(0, 100 - extension.length) + extension;
}

export function validateWhatsAppMediaFile(
  fileOrBlob: Blob,
  fileName: string,
): { valid: true; mimeType: AllowedWhatsAppMimeType; messageType: "document" | "image" }
  | { valid: false; error: string } {
  const mime = (fileOrBlob.type || "").toLowerCase();
  if (!(ALLOWED_WHATSAPP_MIME_TYPES as readonly string[]).includes(mime)) {
    return {
      valid: false,
      error: "Unsupported file type " + (fileOrBlob.type || fileName) + ". Only PDF, JPEG, PNG, and WebP are allowed.",
    };
  }

  if (fileOrBlob.size <= 0) {
    return { valid: false, error: "Attachment file is empty (0 bytes)." };
  }

  if (mime === "application/pdf") {
    if (fileOrBlob.size > WHATSAPP_MAX_PDF_BYTES) {
      return {
        valid: false,
        error: "PDF exceeds the 16 MB WhatsApp limit (" +
          (fileOrBlob.size / (1024 * 1024)).toFixed(2) + " MB).",
      };
    }
    return { valid: true, mimeType: mime as AllowedWhatsAppMimeType, messageType: "document" };
  }

  if (fileOrBlob.size > WHATSAPP_MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: "Image exceeds the 5 MB limit (" +
        (fileOrBlob.size / (1024 * 1024)).toFixed(2) + " MB).",
    };
  }
  return { valid: true, mimeType: mime as AllowedWhatsAppMimeType, messageType: "image" };
}

export async function uploadWhatsAppStagingMedia(params: {
  blob: Blob;
  fileName: string;
  userId: string;
}): Promise<WhatsAppStagingMediaRef> {
  const validation = validateWhatsAppMediaFile(params.blob, params.fileName);
  if (validation.valid === false) throw new Error(validation.error);
  if (!params.userId || params.userId.includes("/") || params.userId.includes("..")) {
    throw new Error("Authenticated user ID is required for staging upload.");
  }

  const safeName = sanitizeStorageFileName(params.fileName);
  const uniquePrefix = String(Date.now()) + "-" + crypto.randomUUID().slice(0, 8);
  const storagePath = "whatsapp-staging/" + params.userId + "/" + uniquePrefix + "-" + safeName;
  const { error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, params.blob, {
      contentType: validation.mimeType,
      upsert: false,
    });

  if (error) throw new Error("Failed to upload staging attachment: " + error.message);
  return {
    kind: "staging",
    bucket: WHATSAPP_MEDIA_BUCKET,
    path: storagePath,
    mime_type: validation.mimeType,
    file_name: safeName,
    byte_size: params.blob.size,
  };
}

interface WaRpcResponse {
  data: unknown;
  error: { message: string } | null;
}

/**
 * The generated Supabase types do not list the WhatsApp v2 RPCs, so every call goes through this
 * single typed wrapper instead of repeating an any-cast at each call site. The explicit call keeps
 * the client as the receiver of rpc.
 */
function callWaRpc(fn: string, args: Record<string, unknown>): PromiseLike<WaRpcResponse> {
  const rpc = supabase.rpc as unknown as (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<WaRpcResponse>;
  return rpc.call(supabase, fn, args);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function libraryKindForCategory(category: WhatsAppLibraryCategory): "catalogue" | "image" | "document" {
  if (category === "catalogue") return "catalogue";
  if (category === "material_image") return "image";
  return "document";
}

function categoryForLibraryKind(kind: string): WhatsAppLibraryCategory {
  if (kind === "catalogue") return "catalogue";
  if (kind === "image") return "material_image";
  return "price_list";
}

export async function uploadAndRegisterLibraryMedia(params: {
  file: File;
  title: string;
  description?: string;
  category: WhatsAppLibraryCategory;
}): Promise<WhatsAppLibraryItemRow> {
  const validation = validateWhatsAppMediaFile(params.file, params.file.name);
  if (validation.valid === false) throw new Error(validation.error);
  const title = params.title.trim();
  if (!title) throw new Error("Library item title is required.");

  const safeName = sanitizeStorageFileName(params.file.name);
  const uniquePrefix = String(Date.now()) + "-" + crypto.randomUUID().slice(0, 8);
  const storagePath = "whatsapp-library/" + params.category + "/" + uniquePrefix + "-" + safeName;
  const { error: uploadError } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, params.file, {
      contentType: validation.mimeType,
      upsert: false,
    });
  if (uploadError) throw new Error("Storage upload failed: " + uploadError.message);

  const { data, error: rpcError } = await callWaRpc("wa_library_register", {
    p_path: storagePath,
    p_title: title,
    p_kind: libraryKindForCategory(params.category),
    p_mime: validation.mimeType,
    p_size_bytes: params.file.size,
    p_sha256: await sha256Hex(params.file),
    p_description: params.description?.trim() || null,
  });

  if (rpcError) {
    await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).remove([storagePath]);
    throw new Error("Library registration failed: " + rpcError.message);
  }

  const id = typeof data === "string" ? data : String(data ?? "");
  const { data: row, error: rowError } = await (supabase.from("whatsapp_library_items" as any) as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rowError || !row) {
    throw new Error(rowError?.message ?? "Library item was registered but could not be reloaded.");
  }
  return row as WhatsAppLibraryItemRow;
}

export async function deleteLibraryItemWithStorage(item: {
  id: string;
  path: string | null;
  bucket?: string | null;
}): Promise<void> {
  const { error: rpcError } = await callWaRpc("wa_library_delete", {
    p_item_id: item.id,
  });
  if (rpcError) throw new Error(rpcError.message);

  if (!item.path) return;
  const { error: storageError } = await supabase.storage
    .from(item.bucket || WHATSAPP_MEDIA_BUCKET)
    .remove([item.path]);
  if (storageError) {
    console.warn("Library metadata removed; Storage API cleanup returned a warning:", storageError.message);
  }
}

export function toEnqueueMediaAttachment(media: WhatsAppMediaRef): Record<string, unknown> {
  if (media.kind === "library") {
    return { library_item_id: media.library_item_id };
  }
  return {
    kind: media.mime_type === "application/pdf" ? "document" : "image",
    staging_path: media.path,
    filename: media.file_name,
    mime: media.mime_type,
    size_bytes: media.byte_size,
  };
}

export function mapLibraryRowToMediaRef(row: WhatsAppLibraryItemRow): WhatsAppLibraryMediaRef {
  if (!row.path || !row.mime || !row.filename) {
    throw new Error("This library item does not have a complete Storage file reference.");
  }
  if (!(ALLOWED_WHATSAPP_MIME_TYPES as readonly string[]).includes(row.mime)) {
    throw new Error("This library item has an unsupported MIME type.");
  }
  return {
    kind: "library",
    library_item_id: row.id,
    bucket: WHATSAPP_MEDIA_BUCKET,
    path: row.path,
    mime_type: row.mime as AllowedWhatsAppMimeType,
    file_name: row.filename,
    byte_size: Number(row.size_bytes ?? 0),
    title: row.title,
    category: categoryForLibraryKind(row.kind),
  };
}

/**
 * Best-effort removal of a staged attachment that was never queued. Uses the Storage API only and
 * refuses any path outside the caller's own whatsapp-staging folder. Callers must never pass a path
 * that has been sent to whatsapp-enqueue for commit, because queued rows still point at it.
 */
export async function removeUnsentStagingObject(path: string, userId: string): Promise<boolean> {
  const expectedPrefix = "whatsapp-staging/" + userId + "/";
  if (!userId || !path.startsWith(expectedPrefix) || path.includes("..") || path.includes("//")) {
    return false;
  }
  try {
    const { error } = await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}
