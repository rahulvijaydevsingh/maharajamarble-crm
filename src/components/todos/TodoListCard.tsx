import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pin,
  Archive,
  Trash2,
  Plus,
  Star,
  ArrowRight,
} from "lucide-react";
import { useTodoItems, TodoItem } from "@/hooks/useTodoItems";
import { TodoItemRow } from "./TodoItemRow";
import { ConvertToTaskDialog } from "./ConvertToTaskDialog";
import { TodoList } from "@/hooks/useTodoLists";

interface TodoListCardProps {
  list: TodoList;
  onDelete: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}

export function TodoListCard({ list, onDelete, onTogglePin, onArchive }: TodoListCardProps) {
  const { items, addItem, updateItem, deleteItem, toggleComplete, toggleStar } = useTodoItems(list.id);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TodoItem | null>(null);

  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;

  const handleAddItem = async () => {
    if (newItemTitle.trim()) {
      await addItem({ list_id: list.id, title: newItemTitle.trim() });
      setNewItemTitle("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  };

  const handleConvertToTask = (item: TodoItem) => {
    setSelectedItem(item);
    setConvertDialogOpen(true);
  };

  return (
    <>
      <Card className="relative overflow-hidden">
        <div
          className="absolute top-0 left-0 w-1 h-full"
          style={{ backgroundColor: list.color }}
        />
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {list.is_pinned && <Pin className="h-4 w-4 text-primary" />}
              <CardTitle className="text-lg">{list.name}</CardTitle>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onTogglePin}>
                  <Pin className="mr-2 h-4 w-4" />
                  {list.is_pinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {totalCount > 0 && (
            <Badge variant="secondary" className="w-fit text-xs">
              {completedCount}/{totalCount} completed
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Items list - show first 5 */}
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {items.slice(0, 5).map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                onToggleComplete={() => toggleComplete(item.id)}
                onToggleStar={() => toggleStar(item.id)}
                onDelete={() => deleteItem(item.id)}
                onConvertToTask={() => handleConvertToTask(item)}
                compact
              />
            ))}
            {items.length > 5 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{items.length - 5} more items
              </p>
            )}
          </div>

          {/* Quick add */}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="Add item..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleAddItem}
              disabled={!newItemTitle.trim()}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedItem && (
        <ConvertToTaskDialog
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          todoItem={selectedItem}
        />
      )}
    </>
  );
}
