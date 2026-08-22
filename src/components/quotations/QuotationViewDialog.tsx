import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { Quotation } from '@/types/quotation';
import { QuotationPDFTemplate } from './QuotationPDFTemplate';
import { downloadQuotationPdf } from '@/lib/quotationPdf';

interface QuotationViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
}

export function QuotationViewDialog({
  open,
  onOpenChange,
  quotation,
}: QuotationViewDialogProps) {
  const templateRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!quotation) return null;

  const handleDownload = async () => {
    if (!templateRef.current) return;

    setIsDownloading(true);
    try {
      await downloadQuotationPdf({
        element: templateRef.current,
        fileName: `${quotation.quotation_number}.pdf`,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between
                                  pb-2 border-b sticky top-0 bg-background z-10">
          <DialogTitle>
            Quotation — {quotation.quotation_number}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isDownloading ? 'Preparing…' : 'Download PDF'}
            </Button>
          </div>
        </DialogHeader>
        <div ref={templateRef} className="mt-4 bg-background">
          <QuotationPDFTemplate quotation={quotation} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
