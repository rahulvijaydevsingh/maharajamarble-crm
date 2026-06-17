import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Quotation } from '@/types/quotation';
import { QuotationPDFTemplate } from './QuotationPDFTemplate';

interface QuotationViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: Quotation | null;
  onDownload: () => void;
}

export function QuotationViewDialog({
  open,
  onOpenChange,
  quotation,
  onDownload,
}: QuotationViewDialogProps) {
  if (!quotation) return null;

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
              onClick={onDownload}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="mt-4">
          <QuotationPDFTemplate quotation={quotation} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
