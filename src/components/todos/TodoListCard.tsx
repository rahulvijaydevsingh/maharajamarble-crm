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
  ChevronDown,
} from "lucide-react";
import { useTodoItems, TodoItem } from "@/hooks/useTodoItems";
import { TodoItemRow } from "./TodoItemRow";
import { ConvertToTaskDialog } from "./ConvertToTaskDialog";
import { TodoList } from "@/hooks/useTodoLists";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TodoListCardProps {
  list: TodoList;
  onDelete: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onOpenList: () => void;
}

export function TodoListCard({ list, onDelete, onTogglePin, onArchive, onOpenList }: TodoListCardProps) {
  const { items, addItem, updateItem, deleteItem, toggleComplete, toggleStar } = useTodoItems(list.id);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TodoItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;
  const activeItems = items.filter((item) => !item.is_completed);
  const completedItems = items.filter((item) => item.is_completed);
  const progress = totalCount ? (completedCount / totalCount) * 100 : 0;

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
      <Card className="relative h-full overflow-hidden">
        <div
          className="absolute top-0 left-0 w-1 h-full"
          style={{ backgroundColor: list.color }}
        />
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {list.is_pinned && <Pin className="h-4 w-4 text-primary" />}
              <CardTitle><Button variant="link" className="h-auto max-w-full justify-start p-0 text-left text-lg text-foreground hover:no-underline" onClick={onOpenList}>{list.name}</Button></CardTitle>
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
          {totalCount > 0 && <div className="flex items-center gap-2"><Badge variant="secondary" className="w-fit text-xs">{completedCount}/{totalCount} completed</Badge><Progress value={progress} className="h-1 flex-1" /></div>}
        </CardHeader>
        <CardContent className="flex h-[286px] flex-col space-y-2">
          <div className="space-y-1">
            {activeItems.slice(0, 4).map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                onToggleComplete={() => toggleComplete(item.id)}
                onToggleStar={() => toggleStar(item.id)}
                onDelete={() => deleteItem(item.id)}
                onConvertToTask={() => handleConvertToTask(item)}
                variant="compact"
              />
            ))}
            {activeItems.length > 4 && <Button type="button" variant="link" size="sm" onClick={onOpenList} className="h-6 px-0 text-xs text-muted-foreground hover:text-foreground">View {activeItems.length - 4} more item{activeItems.length - 4 === 1 ? "" : "s"} ↗</Button>}
            {completedItems.length > 0 && <Collapsible open={showCompleted} onOpenChange={setShowCompleted}><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-0 text-xs text-muted-foreground">✓ {completedCount} completed <ChevronDown className="ml-1 h-3 w-3" /></Button></CollapsibleTrigger><CollapsibleContent className="space-y-1">{completedItems.map((item) => <TodoItemRow key={item.id} item={item} onToggleComplete={() => toggleComplete(item.id)} onToggleStar={() => toggleStar(item.id)} onDelete={() => deleteItem(item.id)} onConvertToTask={() => handleConvertToTask(item)} variant="compact" />)}</CollapsibleContent></Collapsible>}
          </div>

          {/* Quick add */}
          <div className="mt-auto flex gap-2 border-t pt-2">
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
