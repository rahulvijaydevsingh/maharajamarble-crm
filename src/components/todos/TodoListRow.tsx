import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTodoItems, TodoItem } from "@/hooks/useTodoItems";
import { TodoItemRow } from "./TodoItemRow";
import { ConvertToTaskDialog } from "./ConvertToTaskDialog";
import { TodoList } from "@/hooks/useTodoLists";

interface TodoListRowProps {
  list: TodoList;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}

export function TodoListRow({
  list,
  isExpanded,
  onToggleExpand,
  onDelete,
  onTogglePin,
  onArchive,
}: TodoListRowProps) {
  const { items, addItem, deleteItem, toggleComplete, toggleStar } = useTodoItems(list.id);
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

  const handleConvertToTask = (item: TodoItem) => {
    setSelectedItem(item);
    setConvertDialogOpen(true);
  };

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: list.color }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {list.is_pinned && <Pin className="h-3 w-3 text-primary" />}
              <span className="font-medium truncate">{list.name}</span>
            </div>
          </div>

          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {completedCount}/{totalCount}
            </Badge>
          )}

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

        <CollapsibleContent className="pl-12 pr-4 py-2 space-y-2">
          {items.map((item) => (
            <TodoItemRow
              key={item.id}
              item={item}
              onToggleComplete={() => toggleComplete(item.id)}
              onToggleStar={() => toggleStar(item.id)}
              onDelete={() => deleteItem(item.id)}
              onConvertToTask={() => handleConvertToTask(item)}
            />
          ))}

          <div className="flex gap-2">
            <Input
              placeholder="Add item..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddItem}
              disabled={!newItemTitle.trim()}
              className="h-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
