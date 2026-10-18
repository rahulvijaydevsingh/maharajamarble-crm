import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  mimeType?: string | null;
  url: string | null;
}

export function AttachmentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  mimeType,
  url,
}: AttachmentPreviewDialogProps) {
  const isImage = Boolean(mimeType?.startsWith("image/"));
  const isPdf = mimeType === "application/pdf";

  // The browser refuses to embed a PDF straight from the storage address (the site's security settings only
  // allow frames from this site and from blob: addresses). So a PDF is downloaded first and shown from a local
  // blob address, with "Open in new tab" and "Download" as fallbacks.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [imageFailed, setImageFailed] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    setImageFailed(false);
    if (!open || !url || !isPdf) {
      setPdfUrl(null);
      setPdfState("idle");
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setPdfState("loading");

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("download failed");
        return response.blob();
      })
      .then((blob) => {
        // The dialog was closed (or another file opened) while this one was downloading.
        if (requestRef.current !== requestId) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setPdfUrl(objectUrl);
        setPdfState("ready");
      })
      .catch(() => {
        if (requestRef.current === requestId) setPdfState("failed");
      });

    return () => {
      requestRef.current += 1;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url, isPdf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[150] max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="truncate pr-8">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[50vh] max-h-[72vh] items-center justify-center bg-muted p-4">
          {url && isImage && (
            imageFailed ? (
              <p className="text-sm text-muted-foreground">The image could not be displayed.</p>
            ) : (
              <img
                src={url}
                alt={fileName}
                className="max-h-[66vh] max-w-full object-contain"
                onError={() => setImageFailed(true)}
              />
            )
          )}
          {url && isPdf && pdfState === "loading" && (
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          )}
          {url && isPdf && pdfState === "ready" && pdfUrl && (
            <iframe title={fileName} src={pdfUrl} className="h-[66vh] w-full bg-background" />
          )}
          {url && isPdf && pdfState === "failed" && (
            <p className="text-sm text-muted-foreground">The preview could not be loaded.</p>
          )}
        </div>
        {url && isPdf && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-6 py-3 text-xs text-muted-foreground">
            <span>If the preview does not appear:</span>
            <a href={pdfUrl ?? url} target="_blank" rel="noopener noreferrer" className="underline text-primary">
              Open in new tab
            </a>
            <span>or</span>
            <a href={pdfUrl ?? url} download={fileName} className="underline text-primary">
              Download
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
