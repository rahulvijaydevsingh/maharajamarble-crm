import React, { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SoftDeleteLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { id: string; name: string } | null;
  onConfirm: () => void;
}

export function SoftDeleteLeadDialog({ open, onOpenChange, lead, onConfirm }: SoftDeleteLeadDialogProps) {
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    if (open && lead) {
      supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .in("status", ["Pending", "In Progress", "Overdue"])
        .then(({ count }) => setTaskCount(count || 0));
    }
  }, [open, lead]);

  if (!lead) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Move "{lead.name}" to Recycle Bin?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {taskCount > 0
              ? `This lead has ${taskCount} open task${taskCount > 1 ? "s" : ""} which will be hidden from staff.`
              : "This lead will be moved to the Recycle Bin. An admin can restore it later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Move to Recycle Bin
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
