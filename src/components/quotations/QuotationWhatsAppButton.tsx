import React, { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { buildQuotationPdfBlob, type QuotationPdfInput } from "@/lib/quotationPdf";
import { uploadWhatsAppStagingMedia, type WhatsAppStagingMediaRef } from "@/lib/whatsappMedia";
import type { Quotation } from "@/types/quotation";
import { SendWhatsAppDialog } from "@/components/whatsapp/SendWhatsAppDialog";

interface Props {
  quotation: Quotation;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

function formatInr(amount: number): string {
  return "Rs. " + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toPdfInput(quotation: Quotation): QuotationPdfInput {
  return {
    id: quotation.id,
    quotation_number: quotation.quotation_number,
    created_at: quotation.quotation_date || quotation.created_at,
    valid_until: quotation.valid_until,
    status: quotation.status,
    customer_name: quotation.client_name,
    customer_phone: quotation.client_phone,
    customer_address: quotation.client_address,
    site_location: quotation.client_address,
    assigned_to: quotation.assigned_to,
    created_by: quotation.created_by,
    subtotal: quotation.subtotal,
    tax_amount: quotation.gst_amount,
    discount_amount: 0,
    freight_amount: quotation.freight_amount,
    total_amount: quotation.total,
    notes: quotation.notes,
    terms_and_conditions: quotation.terms_and_conditions,
    items: (quotation.items ?? []).map((item) => ({
      id: item.id,
      item_name: item.item_name,
      description: item.description ?? null,
      quantity: Number(item.quantity ?? 0),
      unit: item.unit,
      unit_price: Number(item.rate ?? 0),
      line_total: Number(item.amount ?? 0),
    })),
  };
}

export function QuotationWhatsAppButton({
  quotation,
  size = "sm",
  variant = "outline",
  className,
}: Props) {
  const auth = useAuth();
  const { toast } = useToast();
  const [working, setWorking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attachment, setAttachment] = useState<WhatsAppStagingMediaRef | null>(null);

  const sendQuotation = async () => {
    if (!auth.user?.id) {
      toast({
        title: "Sign in required",
        description: "Sign in again before preparing a WhatsApp quotation.",
        variant: "destructive",
      });
      return;
    }
    if (!quotation.client_phone?.trim()) {
      toast({
        title: "Phone number missing",
        description: "Add the customer's mobile number to this quotation before sending it on WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    setWorking(true);
    try {
      const built = await buildQuotationPdfBlob(toPdfInput(quotation));
      const uploaded = await uploadWhatsAppStagingMedia({
        blob: built.blob,
        fileName: built.fileName,
        userId: auth.user.id,
      });
      setAttachment(uploaded);
      setDialogOpen(true);
    } catch (error: any) {
      toast({
        title: "Quotation PDF could not be prepared",
        description: error?.message ?? "The PDF could not be generated or uploaded.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setAttachment(null);
  };

  const defaultMessage =
    "Dear {{name}}, please find attached quotation {{quotation_number}} for {{quotation_total}}. " +
    "It is valid until {{valid_until|15 Days from Issue}}. Please let us know if you have any questions.";

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => void sendQuotation()}
        disabled={working || !quotation.client_phone?.trim()}
        title={!quotation.client_phone?.trim()
          ? "Add a customer phone number before sending"
          : "Generate and send this quotation PDF on WhatsApp"}
      >
        {working
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <MessageCircle className="mr-2 h-4 w-4" />}
        WhatsApp
      </Button>
      {attachment && (
        <SendWhatsAppDialog
          open={dialogOpen}
          onOpenChange={closeDialog}
          recipientName={quotation.client_name}
          recipientPhone={quotation.client_phone ?? ""}
          leadId={quotation.client_type === "lead" ? quotation.client_id : undefined}
          customerId={quotation.client_type === "customer" ? quotation.client_id : undefined}
          defaultMessage={defaultMessage}
          siteLocation={quotation.client_address ?? ""}
          defaultAttachment={attachment}
          quotationNumber={quotation.quotation_number}
          quotationTotal={formatInr(quotation.total)}
          validUntil={quotation.valid_until ?? ""}
          relatedEntityType={quotation.client_type}
          relatedEntityId={quotation.client_id}
        />
      )}
    </>
  );
}
