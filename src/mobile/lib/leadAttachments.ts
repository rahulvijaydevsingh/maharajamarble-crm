/**
 * Uploads the files staged on the mobile lead form.
 *
 * The mobile site-photo pipeline produces a *compressed* `File` (1024px /
 * <=200KB JPEG). The preview the user sees is a local `blob:` URL, and that
 * URL is worthless once the page is closed — it must never be written to
 * `leads.site_photo_url`.
 *
 * The files are therefore uploaded to the same Supabase Storage bucket and
 * the same `entity_attachments` rows the desktop uses
 * (`src/hooks/useEntityAttachments.ts`). The desktop hook binds itself to one
 * `entityId` at mount time, which does not work for a lead that is created in
 * the same form, so the mobile workspace performs the identical storage
 * contract directly.
 */

import { supabase } from '@/integrations/supabase/client';

/** The live attachment bucket — the desktop uses the very same one. */
export const ATTACHMENT_BUCKET = 'crm-attachments';

/** The storage prefix a lead's attachments live under. */
export const LEAD_ATTACHMENT_PREFIX = 'lead';

export interface LeadAttachmentUploadResult {
  /** How many files were stored successfully. */
  uploaded: number;
  /** How many files failed to store. */
  failed: number;
}

/** Strips the characters the storage path does not allow. */
export function sanitizeAttachmentFileName(name: string): string {
  return (
    name
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 120) || 'file'
  );
}

/**
 * Builds the storage path of one attachment.
 *
 * Mirrors the desktop convention: `<entityType>/<entityId>/<uuid>.<ext>-<name>`.
 */
export function buildAttachmentPath(
  entityType: string,
  entityId: string,
  file: File,
): string {
  const safe = sanitizeAttachmentFileName(file.name);
  const ext = safe.includes('.') ? (safe.split('.').pop() ?? '') : '';
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const base = ext ? `${random}.${ext}` : random;
  return `${entityType}/${entityId}/${base}-${safe}`;
}

/**
 * Uploads every staged file for a lead and registers the attachment rows.
 *
 * Never throws: a failure is reported through the result so the caller can
 * warn the user without blocking the saved lead.
 */
export async function uploadLeadAttachmentFiles(
  leadId: string,
  files: File[],
): Promise<LeadAttachmentUploadResult> {
  const result: LeadAttachmentUploadResult = { uploaded: 0, failed: 0 };
  if (!leadId || !Array.isArray(files) || files.length === 0) return result;

  for (const file of files) {
    const filePath = buildAttachmentPath(LEAD_ATTACHMENT_PREFIX, leadId, file);
    try {
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(filePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('entity_attachments').insert({
        entity_type: LEAD_ATTACHMENT_PREFIX,
        entity_id: leadId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
      });
      if (insertError) {
        // The row failed — the orphaned object is removed again.
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([filePath]);
        throw insertError;
      }

      result.uploaded += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
