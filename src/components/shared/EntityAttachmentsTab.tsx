import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Paperclip, Download, Trash2, Eye, File, Image, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentEntityType, useEntityAttachments } from "@/hooks/useEntityAttachments";

interface EntityAttachmentsTabProps {
  entityType: AttachmentEntityType;
  entityId: string;
  title?: string;
}

function formatFileSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string | null) {
  if (!type) return File;
  if (type.startsWith("image/")) return Image;
  if (type === "application/pdf") return FileText;
  return File;
}

export function EntityAttachmentsTab({ entityType, entityId, title = "Attachments" }: EntityAttachmentsTabProps) {
  const { attachments, loading, uploading, uploadFiles, removeAttachment, getSignedUrl } = useEntityAttachments(
    entityType,
    entityId
  );
  const [isDragging, setIsDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAttachments = attachments.length > 0;

  const accept = useMemo(
    () =>
      [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".csv",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
      ].join(","),
    []
  );

  const handleFiles = async (filesLike: FileList | File[]) => {
    const files = Array.from(filesLike);
    if (!files.length) return;
    await uploadFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const openInNewTab = async (filePath: string) => {
    setBusyId(filePath);
    try {
      const url = await getSignedUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  };

  const downloadFile = async (filePath: string) => {
    setBusyId(filePath);
    try {
      const url = await getSignedUrl(filePath);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {title} {hasAttachments ? `(${attachments.length})` : ""}
        </h3>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Drag & drop files here, or click to select</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, images, Excel supported</p>
        {uploading && <p className="text-xs text-muted-foreground mt-2">Uploading…</p>}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading attachments…</div>
      ) : !hasAttachments ? (
        <div className="text-center py-8 text-muted-foreground">
          <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No attachments yet.</p>
          <p className="text-sm">Upload files to attach them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {attachments.map((file) => {
            const FileIcon = getFileIcon(file.mime_type);
            const isBusy = busyId === file.file_path;
            return (
              <div
                key={file.id}
                className="border rounded-lg p-3 flex items-center gap-3 group hover:bg-muted/50"
              >
                <div className="h-10 w-10 flex items-center justify-center bg-muted rounded">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={file.file_name}>
                    {file.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)} • {file.uploaded_by}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isBusy}
                    onClick={() => void openInNewTab(file.file_path)}
                    title="Open"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isBusy}
                    onClick={() => void downloadFile(file.file_path)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => void removeAttachment(file.id)}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
