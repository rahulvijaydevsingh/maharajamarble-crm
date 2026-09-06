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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[150] max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="truncate pr-8">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[50vh] max-h-[72vh] items-center justify-center bg-muted p-4">
          {url && isImage && <img src={url} alt={fileName} className="max-h-[66vh] max-w-full object-contain" />}
          {url && isPdf && <iframe title={fileName} src={url} className="h-[66vh] w-full bg-background" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}