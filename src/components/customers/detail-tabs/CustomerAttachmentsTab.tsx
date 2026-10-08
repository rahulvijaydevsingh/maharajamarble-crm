import React, { useState } from "react";
import { format } from "date-fns";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Customer } from "@/hooks/useCustomers";
import { useCanManageCustomerAttachments } from "@/hooks/useCanManageCustomerAttachments";
import { useCustomerSecureAttachments } from "@/hooks/useCustomerSecureAttachments";
import { SecureAttachmentUploader } from "@/components/customers/SecureAttachmentUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SecureAttachment } from "@/lib/customerAttachmentsApi";

interface CustomerAttachmentsTabProps {
  customer: Customer;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function CustomerAttachmentsTab({ customer }: CustomerAttachmentsTabProps) {
  const { canManage } = useCanManageCustomerAttachments();
  const {
    attachments,
    isLoading,
    refetch,
    renameMutation,
    deleteMutation,
    downloadFile,
  } = useCustomerSecureAttachments(customer.id, { enabled: canManage });

  // Preview dialog state
  const [previewAttachment, setPreviewAttachment] = useState<SecureAttachment | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Rename dialog state
  const [renameAttachment, setRenameAttachment] = useState<SecureAttachment | null>(null);
  const [newFileName, setNewFileName] = useState("");

  // Delete dialog state
  const [deleteAttachmentItem, setDeleteAttachmentItem] = useState<SecureAttachment | null>(null);

  const handleOpenPreview = async (item: SecureAttachment) => {
    setPreviewAttachment(item);
    setIsLoadingPreview(true);
    try {
      const blob = await downloadFile(item.id);
      const mimeBlob = new Blob([blob], { type: item.mime_type });
      const url = URL.createObjectURL(mimeBlob);
      setPreviewObjectUrl(url);
    } catch {
      setPreviewAttachment(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    setPreviewObjectUrl(null);
    setPreviewAttachment(null);
  };

  const handleDownload = async (item: SecureAttachment) => {
    try {
      const blob = await downloadFile(item.id);
      const mimeBlob = new Blob([blob], { type: item.mime_type });
      const url = URL.createObjectURL(mimeBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Error handled by hook toast
    }
  };

  const handleOpenRename = (item: SecureAttachment) => {
    setRenameAttachment(item);
    setNewFileName(item.file_name);
  };

  const handleConfirmRename = () => {
    if (!renameAttachment || !newFileName.trim()) return;
    renameMutation.mutate(
      { attachmentId: renameAttachment.id, fileName: newFileName.trim() },
      {
        onSuccess: () => {
          setRenameAttachment(null);
          setNewFileName("");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteAttachmentItem) return;
    deleteMutation.mutate(deleteAttachmentItem.id, {
      onSuccess: () => {
        setDeleteAttachmentItem(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-4 border rounded-lg bg-card space-y-3">
        <h3 className="text-sm font-semibold">Upload Attachment</h3>
        <SecureAttachmentUploader
          mode="immediate"
          customerId={customer.id}
          onUploaded={refetch}
        />
        {!canManage && (
          <p className="text-xs text-muted-foreground italic">
            Files you upload are stored securely and are visible to administrators only.
          </p>
        )}
      </div>

      {canManage && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Secured Files</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-muted/20">
              No secured files yet.
            </div>
          ) : (
            <div className="divide-y border rounded-lg bg-card">
              {attachments.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {item.file_name}
                        </span>
                        {item.from_lead && (
                          <Badge variant="secondary" className="text-[10px]">
                            From lead
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>{formatFileSize(item.file_size)}</span>
                        <span>•</span>
                        <span>{item.uploaded_by_name || "Unknown"}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenPreview(item)}
                      title="Preview file"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(item)}
                      title="Download file"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenRename(item)}
                      title="Rename file"
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Rename</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteAttachmentItem(item)}
                      title="Delete file"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate">
              {previewAttachment?.file_name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 bg-muted/20 rounded flex items-center justify-center overflow-hidden relative">
            {isLoadingPreview ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : previewObjectUrl ? (
              previewAttachment?.mime_type.startsWith("image/") ? (
                <img
                  src={previewObjectUrl}
                  alt={previewAttachment.file_name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : previewAttachment?.mime_type === "application/pdf" ? (
                <iframe
                  src={previewObjectUrl}
                  title={previewAttachment.file_name}
                  className="w-full h-full border-0"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type.
                </p>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={!!renameAttachment}
        onOpenChange={(open) => !open && setRenameAttachment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter new file name"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameAttachment(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={renameMutation.isPending || !newFileName.trim()}
              onClick={handleConfirmRename}
            >
              {renameMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteAttachmentItem}
        onOpenChange={(open) => !open && setDeleteAttachmentItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Delete this file permanently? This cannot be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteAttachmentItem(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
