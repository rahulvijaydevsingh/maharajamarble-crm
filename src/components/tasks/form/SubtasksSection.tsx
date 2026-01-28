import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface Subtask {
  id: string;
  title: string;
  is_completed: boolean;
}

interface SubtasksSectionProps {
  subtasks: Subtask[];
  onAddSubtask: (title: string) => void;
  onUpdateSubtask: (id: string, updates: Partial<Subtask>) => void;
  onDeleteSubtask: (id: string) => void;
  onReorder?: (subtasks: Subtask[]) => void;
  disabled?: boolean;
}

export function SubtasksSection({
  subtasks,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
  disabled = false,
}: SubtasksSectionProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const completedCount = subtasks.filter((s) => s.is_completed).length;
  const totalCount = subtasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubtask();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Subtasks</span>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount} of {totalCount} completed
          </span>
        )}
      </div>

      {totalCount > 0 && (
        <Progress value={progress} className="h-2" />
      )}

      <div className="space-y-2">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30 group"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
            <Checkbox
              checked={subtask.is_completed}
              onCheckedChange={(checked) =>
                onUpdateSubtask(subtask.id, { is_completed: !!checked })
              }
              disabled={disabled}
            />
            {editingId === subtask.id ? (
              <Input
                value={subtask.title}
                onChange={(e) =>
                  onUpdateSubtask(subtask.id, { title: e.target.value })
                }
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                className="h-7 text-sm"
                autoFocus
                disabled={disabled}
              />
            ) : (
              <span
                className={`flex-1 text-sm cursor-pointer ${
                  subtask.is_completed ? "line-through text-muted-foreground" : ""
                }`}
                onClick={() => !disabled && setEditingId(subtask.id)}
              >
                {subtask.title}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
              onClick={() => onDeleteSubtask(subtask.id)}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a subtask..."
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddSubtask}
          disabled={!newSubtaskTitle.trim() || disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
