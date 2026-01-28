import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { AlertTriangle, Eye, UserPlus, X, ShieldAlert } from "lucide-react";
import { DuplicateCheckResult } from "@/hooks/usePhoneDuplicateCheck";
import { LeadDetailView } from "./LeadDetailView";
import { Lead } from "@/hooks/useLeads";
import { useToast } from "@/hooks/use-toast";

interface DuplicateLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateResult: DuplicateCheckResult;
  onViewExisting: () => void;
  onAddToExisting: () => void;
  onCancel: () => void;
  onOverride?: () => void;
  isAdmin?: boolean;
}

export function DuplicateLeadModal({
  open,
  onOpenChange,
  duplicateResult,
  onViewExisting,
  onAddToExisting,
  onCancel,
  onOverride,
  isAdmin = false,
}: DuplicateLeadModalProps) {
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const { toast } = useToast();
  const record = duplicateResult.existingRecord;
  
  if (!record) return null;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "new": return "bg-blue-100 text-blue-800";
      case "in-progress": return "bg-yellow-100 text-yellow-800";
      case "quoted": return "bg-purple-100 text-purple-800";
      case "won": return "bg-green-100 text-green-800";
      case "lost": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeLabel = () => {
    switch (duplicateResult.type) {
      case "customer": return "Customer";
      case "professional": return "Professional";
      default: return "Lead";
    }
  };

  // Convert existing record to Lead format for LeadDetailView
  const recordAsLead: Lead | null = duplicateResult.type === "lead" && record ? {
    id: record.id,
    created_at: record.created_at,
    created_by: "Unknown",
    updated_at: record.created_at,
    name: record.name,
    phone: record.phone,
    alternate_phone: null,
    email: record.email,
    designation: "individual",
    firm_name: record.firm_name,
    additional_contacts: [],
    site_location: record.address,
    site_photo_url: null,
    site_plus_code: null,
    construction_stage: null,
    estimated_quantity: null,
    material_interests: null,
    source: "walk_in",
    referred_by: null,
    assigned_to: record.assigned_to,
    status: record.status,
    priority: 3,
    notes: null,
    address: record.address,
    last_follow_up: null,
    next_follow_up: null,
  } : null;

  const handleViewExistingClick = () => {
    if (duplicateResult.type === "lead" && recordAsLead) {
      setDetailViewOpen(true);
    } else {
      onViewExisting();
    }
  };

  const handleAddToExistingClick = () => {
    // Show a toast confirming the action, don't open a new tab
    toast({
      title: "Adding to Existing Record",
      description: `Additional information will be merged with ${record.name}'s existing record.`,
    });
    onAddToExisting();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Duplicate {getTypeLabel()} Found
            </DialogTitle>
            <DialogDescription>
              This phone number already exists in our system. Please review the existing record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            {/* Existing Record Details */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-lg">{record.name}</h4>
                <Badge className={getStatusColor(record.status)}>{record.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-medium">{record.phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{record.email || "-"}</p>
                </div>
                {record.firm_name && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Company:</span>
                    <p className="font-medium">{record.firm_name}</p>
                  </div>
                )}
                {record.address && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Address:</span>
                    <p className="font-medium">{record.address}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Assigned To:</span>
                  <p className="font-medium">{record.assigned_to}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">
                    {format(new Date(record.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </div>

            {/* Warning Message */}
            <p className="text-sm text-muted-foreground">
              Creating duplicate leads can lead to data inconsistency and confusion. 
              We recommend updating the existing record instead.
            </p>
          </div>

          <DialogFooter className="shrink-0 flex-wrap gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel} className="flex-1 sm:flex-none">
              <X className="h-4 w-4 mr-2" />
              Cancel New Lead
            </Button>
            <Button variant="secondary" onClick={handleAddToExistingClick} className="flex-1 sm:flex-none">
              <UserPlus className="h-4 w-4 mr-2" />
              Add to Existing
            </Button>
            <Button onClick={handleViewExistingClick} className="flex-1 sm:flex-none">
              <Eye className="h-4 w-4 mr-2" />
              View Existing {getTypeLabel()}
            </Button>
            {isAdmin && onOverride && (
              <Button variant="destructive" onClick={onOverride} className="flex-1 sm:flex-none">
                <ShieldAlert className="h-4 w-4 mr-2" />
                Override & Create
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail View for viewing existing lead */}
      {recordAsLead && (
        <LeadDetailView
          lead={recordAsLead}
          open={detailViewOpen}
          onOpenChange={(open) => {
            setDetailViewOpen(open);
            if (!open) {
              onOpenChange(false);
            }
          }}
          onEdit={() => {
            setDetailViewOpen(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
