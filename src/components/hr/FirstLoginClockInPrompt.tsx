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
import { Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useHRModule } from "@/contexts/HRModuleContext";
import { useAuth } from "@/contexts/AuthContext";

export function FirstLoginClockInPrompt() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { hrEnabled } = useHRModule();
  const { role } = useAuth();

  useEffect(() => {
    const shouldPrompt = sessionStorage.getItem("should_prompt_clock_in");
    if (shouldPrompt === "true" && hrEnabled && role !== "sales_viewer") {
      setOpen(true);
      sessionStorage.removeItem("should_prompt_clock_in");
    }
  }, [hrEnabled, role]);

  const handleClockIn = () => {
    setOpen(false);
    navigate("/hr/attendance");
  };

  const handleLater = () => {
    setOpen(false);
  };

  if (!hrEnabled || role === "sales_viewer") return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Good Morning! Clock In for Today
          </AlertDialogTitle>
          <AlertDialogDescription>
            This is your first login today. Would you like to clock in for attendance now?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLater}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={handleClockIn}>Clock In Now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
