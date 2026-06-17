import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PerformanceNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
}

export function PerformanceNotesDialog({ open, onOpenChange, staffId, staffName }: PerformanceNotesDialogProps) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [visibleToStaff, setVisibleToStaff] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await (supabase.from("staff_performance_notes" as any).insert({
        staff_id: staffId,
        note: note.trim(),
        note_type: "manual",
        is_visible_to_staff: visibleToStaff,
        created_by: user?.id,
      } as any) as any);
      toast.success("Performance note added");
      setNote("");
      setVisibleToStaff(false);
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Performance Note — {staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Textarea
            placeholder="Enter performance note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Switch checked={visibleToStaff} onCheckedChange={setVisibleToStaff} id="visible" />
            <Label htmlFor="visible" className="text-sm">Visible to staff member</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !note.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
