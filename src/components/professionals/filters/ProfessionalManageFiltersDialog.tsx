import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Star, Users } from "lucide-react";
import { SavedFilter } from "@/hooks/useSavedFilters";

interface ProfessionalManageFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SavedFilter[];
  onEdit: (filter: SavedFilter) => void;
  onDelete: (id: string) => Promise<void>;
  getFilterCount: (filter: SavedFilter) => number;
}

export function ProfessionalManageFiltersDialog({
  open,
  onOpenChange,
  filters,
  onEdit,
  onDelete,
  getFilterCount,
}: ProfessionalManageFiltersDialogProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Saved Filters</DialogTitle>
            <DialogDescription>Edit or delete your saved professional filters.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filters.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No saved filters yet.</p>
            ) : (
              filters.map((filter) => (
                <div key={filter.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{filter.name}</span>
                        {filter.is_default && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                        {filter.is_shared && <Users className="h-3 w-3 text-blue-500" />}
                      </div>
                      <Badge variant="secondary" className="mt-1">{getFilterCount(filter)} professionals</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { onEdit(filter); onOpenChange(false); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(filter.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Filter</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this filter? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
