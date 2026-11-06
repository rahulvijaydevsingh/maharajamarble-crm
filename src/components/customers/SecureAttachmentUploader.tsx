import React, { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_ATTACHMENT_ACCEPT,
  CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS,
  CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES,
  CUSTOMER_ATTACHMENT_MAX_BYTES,
  CustomerAttachmentError,
  getCustomerAttachmentErrorMessage,
  uploadCustomerAttachment,
} from "@/lib/customerAttachmentsApi";
import { addStagedFile, getPreviewKind } from "@/lib/customerAttachmentFiles";

type SecureAttachmentUploaderProps =
  | {
      mode: "immediate";
      customerId: string;
      onUploaded?: () => void;
      disabled?: boolean;
    }
  | {
      mode: "stage";
      files: File[];
      onFilesChange: (files: File[]) => void;
      disabled?: boolean;
    };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/** One file in the new-customer form's list. A picture can be tapped to see it larger. */
function StagedFileRow({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const kind = getPreviewKind(file);
  const [url, setUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (kind !== "image") {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file, kind]);

  return (
    <div className="space-y-2 p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {url ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="shrink-0 overflow-hidden rounded border"
              title={expanded ? "Hide the larger preview" : "Show a larger preview"}
            >
              <img
                src={url}
                alt=""
                className="h-14 w-14 object-cover"
                onError={() => setUrl(null)}
              />
            </button>
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={disabled}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove</span>
        </Button>
      </div>
      {expanded && url && (
        <img
          src={url}
          alt={"Preview of " + file.name}
          className="mx-auto max-h-[50vh] w-full rounded-md border bg-muted/40 object-contain"
        />
      )}
    </div>
  );
}

export function SecureAttachmentUploader(props: SecureAttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Only used when the file is uploaded straight away (the customer's Attachments tab): the file picked
  // but not yet confirmed.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const previewKind = selectedFile ? getPreviewKind(selectedFile) : "none";

  const clearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > CUSTOMER_ATTACHMENT_MAX_BYTES) {
      setValidationError("This file is larger than 10 MB.");
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // When the browser reports a type it must be an allowed one; when it reports none, use the extension.
    const extension = file.name.includes(".")
      ? (file.name.split(".").pop() ?? "").toLowerCase()
      : "";
    const typeIsAllowed = file.type
      ? CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())
      : CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS.includes(extension);

    if (!typeIsAllowed) {
      setValidationError("Only PDF, JPG, PNG and WebP files are allowed.");
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (props.mode === "stage") {
      // New-customer form: the file goes straight into the list that is uploaded when the customer is saved.
      // Pressing Save is the confirmation, so there is nothing to forget to confirm.
      const result = addStagedFile(props.files, file);
      setValidationError(result.error);
      if (!result.error) {
        props.onFilesChange(result.files);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setValidationError(null);
    setSelectedFile(file);

    const kind = getPreviewKind(file);
    setPreviewUrl(kind === "none" ? null : URL.createObjectURL(file));
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile || props.mode !== "immediate") return;

    setIsUploading(true);
    setValidationError(null);
    try {
      await uploadCustomerAttachment(props.customerId, selectedFile);
      const fileName = selectedFile.name;
      clearSelection();
      setSuccessMessage("Uploaded securely: " + fileName);
      if (props.onUploaded) {
        props.onUploaded();
      }
    } catch (error: unknown) {
      const code =
        error instanceof CustomerAttachmentError
          ? error.code
          : "server_error";
      setValidationError(getCustomerAttachmentErrorMessage(code));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveStaged = (index: number) => {
    if (props.mode === "stage") {
      const updated = props.files.filter((_, i) => i !== index);
      props.onFilesChange(updated);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={CUSTOMER_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={props.disabled || isUploading}
      />

      {successMessage && (
        <div className="p-2.5 bg-green-50 text-green-800 text-sm rounded-md border border-green-200">
          {successMessage}
        </div>
      )}

      {validationError && (
        <div className="p-2.5 bg-destructive/10 text-destructive text-sm rounded-md">
          {validationError}
        </div>
      )}

      {!selectedFile && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            {props.mode === "stage" ? "Add file" : "Choose file"}
          </Button>
        </div>
      )}

      {selectedFile && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="overflow-hidden rounded-md border bg-background">
            {previewUrl && previewKind === "image" ? (
              <img
                src={previewUrl}
                alt={"Preview of " + selectedFile.name}
                className="mx-auto max-h-[50vh] w-full object-contain"
                onError={() => setPreviewUrl(null)}
              />
            ) : previewUrl && previewKind === "pdf" ? (
              <object
                data={previewUrl}
                type="application/pdf"
                aria-label={"Preview of " + selectedFile.name}
                className="block h-[50vh] w-full"
              >
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <FileText className="h-6 w-6" />
                  A preview is not available here. You can still upload the file.
                </div>
              </object>
            ) : (
              <div className="flex items-center justify-center p-8 text-primary">
                <FileText className="h-10 w-10" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={props.disabled || isUploading}
              onClick={handleConfirmUpload}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Confirm & upload"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.disabled || isUploading}
              onClick={clearSelection}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {props.mode === "stage" && props.files.length > 0 && (
        <div className="space-y-2">
          <div className="divide-y rounded-md border">
            {props.files.map((file, index) => (
              <StagedFileRow
                key={file.name + "-" + file.size + "-" + index}
                file={file}
                disabled={props.disabled}
                onRemove={() => handleRemoveStaged(index)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            These files are encrypted and saved when you save the customer. Tap a picture to see it larger.
          </p>
        </div>
      )}
    </div>
  );
}
