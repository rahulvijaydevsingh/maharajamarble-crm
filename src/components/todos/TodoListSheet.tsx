import React, { useState } from "react";
import { Archive, ChevronDown, MoreHorizontal, Pin, Plus, Trash2 } from "lucide-react";
import { TodoList } from "@/hooks/useTodoLists";
import { TodoItem, useTodoItems } from "@/hooks/useTodoItems";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TodoItemRow } from "./TodoItemRow";
import { ConvertToTaskDialog } from "./ConvertToTaskDialog";

interface TodoListSheetProps {
  list: TodoList | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}

export function TodoListSheet({ list, open, onOpenChange, onDelete, onTogglePin, onArchive }: TodoListSheetProps) {
  const { items, addItem, deleteItem, toggleComplete, toggleStar } = useTodoItems(list?.id);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [selectedItem, setSelectedItem] = useState<TodoItem | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);

  if (!list) return null;

  const activeItems = items.filter((item) => !item.is_completed);
  const completedItems = items.filter((item) => item.is_completed);
  const progress = items.length ? (completedItems.length / items.length) * 100 : 0;
  const addNewItem = async () => {
    if (!newItemTitle.trim()) return;
    await addItem({ list_id: list.id, title: newItemTitle.trim() });
    setNewItemTitle("");
  };
  const convertItem = (item: TodoItem) => {
    setSelectedItem(item);
    setConvertDialogOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-[540px]">
          <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
            <div className="flex items-center gap-2">
              {list.is_pinned && <Pin className="h-4 w-4 text-primary" />}
              <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
              <SheetTitle className="break-words">{list.name}</SheetTitle>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Badge variant="secondary" className="text-xs">{completedItems.length}/{items.length} completed</Badge>
              <Progress value={progress} className="h-1 flex-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="List actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onTogglePin}><Pin className="mr-2 h-4 w-4" />{list.is_pinned ? "Unpin" : "Pin to top"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={onArchive}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section>
              <h3 className="mb-2 text-sm font-medium">Active ({activeItems.length})</h3>
              <div className="space-y-1">
                {activeItems.map((item) => <TodoItemRow key={item.id} item={item} variant="full" onToggleComplete={() => toggleComplete(item.id)} onToggleStar={() => toggleStar(item.id)} onDelete={() => deleteItem(item.id)} onConvertToTask={() => convertItem(item)} />)}
                {activeItems.length === 0 && <p className="py-4 text-sm text-muted-foreground">No active items.</p>}
              </div>
            </section>
            {completedItems.length > 0 && <Collapsible className="mt-5">
              <CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between px-0 text-sm font-medium">Completed ({completedItems.length})<ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">{completedItems.map((item) => <TodoItemRow key={item.id} item={item} variant="full" onToggleComplete={() => toggleComplete(item.id)} onToggleStar={() => toggleStar(item.id)} onDelete={() => deleteItem(item.id)} onConvertToTask={() => convertItem(item)} />)}</CollapsibleContent>
            </Collapsible>}
          </div>
          <div className="border-t bg-background p-4"><div className="flex gap-2"><Input placeholder="Add item..." value={newItemTitle} onChange={(event) => setNewItemTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addNewItem(); } }} /><Button size="sm" onClick={addNewItem} disabled={!newItemTitle.trim()} aria-label="Add item"><Plus className="h-4 w-4" /></Button></div></div>
        </SheetContent>
      </Sheet>
      {selectedItem && <ConvertToTaskDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen} todoItem={selectedItem} />}
    </>
  );
}