import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LostReason {
  id: string;
  reason_key: string;
  reason_label: string;
  cooling_off_days: number | null;
}

interface MarkAsLostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  onSubmit: (reasonKey: string, notes: string) => Promise<void>;
}

export function MarkAsLostDialog({
  open,
  onOpenChange,
  leadName,
  onSubmit,
}: MarkAsLostDialogProps) {
  const [reasons, setReasons] = useState<LostReason[]>([]);
  const [selectedReason, setSelectedReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedReason("");
      setNotes("");
      fetchReasons();
    }
  }, [open]);

  const fetchReasons = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lead_lost_reasons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setReasons((data as LostReason[]) || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await onSubmit(selectedReason, notes);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[120]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mark Lead as Lost
          </DialogTitle>
          <DialogDescription>
            This will send <strong>{leadName}</strong> for manager approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Lost Reason <span className="text-destructive">*</span></Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "Select a reason"} />
              </SelectTrigger>
              <SelectContent className="z-[220]">
                {reasons.map((r) => (
                  <SelectItem key={r.reason_key} value={r.reason_key}>
                    {r.reason_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any additional context…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
