
import React from "react";
import { UnifiedLeadForm } from "../UnifiedLeadForm";

interface EditLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadData: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
  };
  onSave: (updatedData: any) => void;
}

export function EditLeadDialog({ open, onOpenChange, leadData, onSave }: EditLeadDialogProps) {
  return (
    <UnifiedLeadForm
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      leadData={leadData}
      onSave={onSave}
    />
  );
}
