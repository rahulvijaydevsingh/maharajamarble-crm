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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Lock, RotateCcw, Save, Loader2 } from "lucide-react";
import { ColumnConfig } from "@/hooks/useTablePreferences";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";

interface ColumnManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnConfig[];
  onSave: (columns: ColumnConfig[]) => Promise<void>;
  onReset: () => Promise<void>;
  saving: boolean;
}

export function ColumnManagerDialog({
  open,
  onOpenChange,
  columns,
  onSave,
  onReset,
  saving,
}: ColumnManagerDialogProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns);

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns, open]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    // Don't allow moving locked columns
    if (localColumns[sourceIndex].locked) return;

    const reordered = Array.from(localColumns);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    const updated = reordered.map((col, idx) => ({ ...col, order: idx }));
    setLocalColumns(updated);
  };

  const handleToggle = (key: string) => {
    setLocalColumns((prev) =>
      prev.map((col) =>
        col.key === key && !col.locked ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleSave = async () => {
    await onSave(localColumns);
    onOpenChange(false);
  };

  const handleReset = async () => {
    await onReset();
    onOpenChange(false);
  };

  const visibleCount = localColumns.filter((c) => c.visible).length;
  const minVisible = localColumns.filter((c) => c.locked).length + 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5" />
            Manage Columns
          </DialogTitle>
          <DialogDescription>
            Drag to reorder columns. Toggle visibility with the switches.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="text-sm text-muted-foreground mb-3">
            {visibleCount} of {localColumns.length} columns visible
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="columns">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-1 max-h-[400px] overflow-y-auto"
                >
                  {localColumns.map((column, index) => (
                    <Draggable
                      key={column.key}
                      draggableId={column.key}
                      index={index}
                      isDragDisabled={column.locked}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center justify-between p-2 rounded-md border ${
                            snapshot.isDragging
                              ? "bg-muted border-primary"
                              : "bg-background"
                          } ${column.locked ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              {...provided.dragHandleProps}
                              className={`cursor-grab ${
                                column.locked ? "cursor-not-allowed opacity-50" : ""
                              }`}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="text-sm">{column.label}</span>
                            {column.locked && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Lock className="h-3 w-3" />
                                Locked
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={column.visible}
                            onCheckedChange={() => handleToggle(column.key)}
                            disabled={
                              column.locked ||
                              (column.visible && visibleCount <= minVisible)
                            }
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
