import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AttachmentEntityType = "lead" | "customer" | "task" | "professional";

export interface EntityAttachmentRow {
  id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  file_name: string;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  source_type?: "activity" | "task" | "note" | "direct" | null;
  source_id?: string | null;
  source_label?: string | null;
  storage_missing?: boolean | null;
}

export interface EntityAttachment extends EntityAttachmentRow {
  signedUrl?: string;
}

const BUCKET = "crm-attachments";

function sanitizeFileName(name: string) {
  return (name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120)) || "file";
}

function buildPath(entityType: AttachmentEntityType, entityId: string, file: File) {
  const safe = sanitizeFileName(file.name);
  const ext = safe.includes(".") ? safe.split(".").pop() : "";
  const random = crypto.randomUUID();
  const base = ext ? `${random}.${ext}` : random;
  return `${entityType}/${entityId}/${base}-${safe}`;
}

export function useEntityAttachments(entityType: AttachmentEntityType, entityId: string | null | undefined) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EntityAttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!entityId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("entity_attachments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data || []) as unknown as EntityAttachmentRow[]);
    } catch (e: any) {
      console.error("Failed to fetch attachments:", e);
      toast({ title: "Failed to load attachments", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, toast]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const getSignedUrl = useCallback(async (filePath: string | null | undefined) => {
    if (!filePath) throw new Error("This file is unavailable because it is not stored in CRM.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  const attachments = useMemo(() => {
    return rows.map((r) => ({ ...r }));
  }, [rows]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!entityId) return;
      if (!files.length) return;

      setUploading(true);
      try {
        for (const file of files) {
          const filePath = buildPath(entityType, entityId, file);

          const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
          if (uploadError) throw uploadError;

          const { error: insertError } = await supabase.from("entity_attachments").insert({
            entity_type: entityType,
            entity_id: entityId,
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type || null,
            file_size: file.size,
          });
          if (insertError) {
            await supabase.storage.from(BUCKET).remove([filePath]);
            throw insertError;
          }
        }

        toast({ title: "Uploaded", description: `Added ${files.length} attachment(s)` });
        await fetchAttachments();
      } catch (e: any) {
        console.error("Upload failed:", e);
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [entityId, entityType, fetchAttachments, toast]
  );

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      try {
        const attachment = rows.find((row) => row.id === attachmentId);
        if (!attachment) return;

        if (attachment.file_path) {
          const { error: storageError } = await supabase.storage.from(BUCKET).remove([attachment.file_path]);
          if (storageError) throw storageError;
        }

        const { error } = await supabase.from("entity_attachments").delete().eq("id", attachmentId);
        if (error) throw error;
        setRows((prev) => prev.filter((r) => r.id !== attachmentId));
        toast({ title: "Attachment deleted" });
      } catch (e: any) {
        console.error("Remove attachment failed:", e);
        toast({ title: "Delete failed", description: e.message, variant: "destructive" });
      }
    },
    [rows, toast]
  );

  return {
    bucket: BUCKET,
    loading,
    uploading,
    attachments,
    refetch: fetchAttachments,
    uploadFiles,
    removeAttachment,
    getSignedUrl,
  };
}
