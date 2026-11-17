import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TodoItem, TodoItemInsert } from "@/hooks/useTodoItems";

export type TodoItemEditValues = {
  title: string;
  notes: string;
  dueDate: string;
};

export function buildTodoItemEditPayload(values: TodoItemEditValues): Pick<TodoItemInsert, "title" | "notes" | "due_date"> {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    due_date: values.dueDate || null,
  };
}

interface EditTodoItemDialogProps {
  item: TodoItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (itemId: string, updates: Pick<TodoItemInsert, "title" | "notes" | "due_date">) => Promise<void>;
}

export function EditTodoItemDialog({ item, open, onOpenChange, onSave }: EditTodoItemDialogProps) {
  const [values, setValues] = useState<TodoItemEditValues>({ title: "", notes: "", dueDate: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setValues({
        title: item.title,
        notes: item.notes || "",
        dueDate: item.due_date || "",
      });
    }
  }, [item]);

  const handleSave = async () => {
    if (!item || !values.title.trim()) return;

    setSaving(true);
    try {
      await onSave(item.id, buildTodoItemEditPayload(values));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>Update the details for this to-do item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="todo-item-title">Item</Label>
            <Input
              id="todo-item-title"
              value={values.title}
              onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="todo-item-notes">Notes</Label>
            <Textarea
              id="todo-item-notes"
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Add details..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="todo-item-due-date">Due date</Label>
            <Input
              id="todo-item-due-date"
              type="date"
              value={values.dueDate}
              onChange={(event) => setValues((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !values.title.trim()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}