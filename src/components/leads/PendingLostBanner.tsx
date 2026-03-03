import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";

interface PendingLostBannerProps {
  lostReason: string | null;
  lostReasonNotes: string | null;
  pendingLostSince: string | null;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}

const REASON_LABELS: Record<string, string> = {
  price_too_high: "Price Too High",
  chose_competitor: "Chose Competitor",
  project_cancelled: "Project Cancelled",
  not_responding: "Not Responding",
  not_interested: "Not Interested",
  budget_constraint: "Budget Constraint",
  duplicate: "Duplicate Lead",
  other: "Other",
};

export function PendingLostBanner({
  lostReason,
  lostReasonNotes,
  pendingLostSince,
  onApprove,
  onReject,
}: PendingLostBannerProps) {
  const { role } = usePermissions();
  const isAdminUser = role === "super_admin" || role === "admin" || role === "manager";

  const handleApprove = async () => {
    setProcessing("approve");
    try { await onApprove(); } finally { setProcessing(null); }
  };

  const handleReject = async () => {
    setProcessing("reject");
    try { await onReject(); } finally { setProcessing(null); }
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 mb-4">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-violet-800">
              Loss Approval Pending
            </span>
            <Badge variant="secondary" className="bg-violet-100 text-violet-700">
              Awaiting Manager Review
            </Badge>
          </div>
          <p className="text-sm text-violet-700 mt-1">
            <strong>Reason:</strong> {REASON_LABELS[lostReason || ""] || lostReason || "—"}
            {lostReasonNotes && (
              <span className="ml-2 text-violet-600">— {lostReasonNotes}</span>
            )}
          </p>
          {pendingLostSince && (
            <p className="text-xs text-violet-500 mt-1">
              Requested on {format(new Date(pendingLostSince), "dd MMM yyyy, hh:mm a")}
            </p>
          )}

          {isAdmin() && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={processing !== null}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {processing === "approve" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Approve Lost
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReject}
                disabled={processing !== null}
              >
                {processing === "reject" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Reject — Keep Active
              </Button>
            </div>
          )}

          {!isAdmin() && (
            <p className="text-sm text-violet-600 mt-2 italic">
              Your manager will review and approve or reject this request.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
