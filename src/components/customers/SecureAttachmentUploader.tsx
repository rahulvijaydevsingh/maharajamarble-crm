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

export function SecureAttachmentUploader(props: SecureAttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local state for file selected in picker (before confirmation)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      return;
    }

    setValidationError(null);
    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    if (props.mode === "immediate") {
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
    } else {
      // mode === "stage"
      const existing = props.files;
      const isDuplicate = existing.some(
        (f) => f.name === selectedFile.name && f.size === selectedFile.size,
      );

      if (!isDuplicate && existing.length < 10) {
        props.onFilesChange([...existing, selectedFile]);
      }

      clearSelection();
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
            Choose file
          </Button>
        </div>
      )}

      {selectedFile && (
        <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-16 w-16 object-cover rounded border"
              />
            ) : (
              <div className="h-12 w-12 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
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
          <div className="divide-y border rounded-md">
            {props.files.map((file, index) => (
              <div
                key={file.name + "-" + file.size + "-" + index}
                className="flex items-center justify-between p-2.5 text-sm"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  disabled={props.disabled}
                  onClick={() => handleRemoveStaged(index)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            These files are uploaded when you save.
          </p>
        </div>
      )}
    </div>
  );
}
