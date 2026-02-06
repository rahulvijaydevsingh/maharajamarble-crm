import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Plus, MoreHorizontal, Pencil, Trash2, Copy, Loader2, HeartHandshake } from "lucide-react";
import { useKitPresets } from "@/hooks/useKitPresets";
import { KitPresetEditor } from "./KitPresetEditor";
import { KIT_TOUCH_METHOD_ICONS, KIT_CYCLE_BEHAVIOR_LABELS, KitTouchMethod, KitPreset } from "@/constants/kitConstants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function KitPresetList() {
  const { presets, loading, createPreset, updatePreset, deletePreset } = useKitPresets();
  
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<KitPreset | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPreset, setDeletingPreset] = useState<KitPreset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = () => {
    setEditingPreset(null);
    setEditorOpen(true);
  };

  const handleEdit = (preset: KitPreset) => {
    setEditingPreset(preset);
    setEditorOpen(true);
  };

  const handleDuplicate = async (preset: KitPreset) => {
    try {
      await createPreset({
        name: `${preset.name} (Copy)`,
        description: preset.description,
        touch_sequence: preset.touch_sequence,
        default_cycle_behavior: preset.default_cycle_behavior,
      });
      toast.success("Preset duplicated successfully");
    } catch (error) {
      toast.error("Failed to duplicate preset");
    }
  };

  const handleDelete = async () => {
    if (!deletingPreset) return;
    
    setIsDeleting(true);
    try {
      await deletePreset(deletingPreset.id);
      toast.success("Preset deleted");
    } catch (error) {
      toast.error("Failed to delete preset");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeletingPreset(null);
    }
  };

  const handleSavePreset = async (data: any) => {
    try {
      if (editingPreset) {
        await updatePreset({ id: editingPreset.id, ...data });
        toast.success("Preset updated");
      } else {
        await createPreset(data);
        toast.success("Preset created");
      }
      setEditorOpen(false);
      setEditingPreset(null);
    } catch (error) {
      toast.error("Failed to save preset");
    }
  };

  const renderSequenceSummary = (preset: KitPreset) => {
    const sequence = preset.touch_sequence || [];
    if (sequence.length === 0) return <span className="text-muted-foreground">No touches</span>;

    return (
      <div className="flex items-center gap-1">
        {sequence.slice(0, 4).map((touch, idx) => {
          const Icon = KIT_TOUCH_METHOD_ICONS[touch.method as KitTouchMethod];
          return (
            <div
              key={idx}
              className="p-1 rounded bg-muted"
              title={`${touch.method} after ${touch.interval_days} days`}
            >
              <Icon className="h-3 w-3" />
            </div>
          );
        })}
        {sequence.length > 4 && (
          <span className="text-xs text-muted-foreground">+{sequence.length - 4} more</span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HeartHandshake className="h-5 w-5" />
                KIT Presets
              </CardTitle>
              <CardDescription>
                Define touch sequences for relationship nurturing
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Preset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {presets.length === 0 ? (
            <div className="text-center py-12">
              <HeartHandshake className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground mb-4">No presets created yet</p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Preset
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sequence</TableHead>
                  <TableHead>Cycle Behavior</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presets.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{preset.name}</p>
                        {preset.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {preset.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {renderSequenceSummary(preset)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {KIT_CYCLE_BEHAVIOR_LABELS[preset.default_cycle_behavior] || preset.default_cycle_behavior}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={preset.is_active ? "default" : "secondary"}>
                        {preset.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(preset)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(preset)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              setDeletingPreset(preset);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <KitPresetEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        preset={editingPreset}
        onSave={handleSavePreset}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPreset?.name}"? This action cannot be undone.
              Active subscriptions using this preset will continue but won't be editable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
