import React, { useState } from "react";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useTodoItems } from "@/hooks/useTodoItems";
import { TodoListCard } from "./TodoListCard";
import { TodoListRow } from "./TodoListRow";
import { Loader2 } from "lucide-react";

interface TodoListsViewProps {
  viewMode: "cards" | "list";
}

export function TodoListsView({ viewMode }: TodoListsViewProps) {
  const { lists, loading, deleteList, togglePin, archiveList } = useTodoLists();
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No to-do lists yet. Create your first list to get started!</p>
      </div>
    );
  }

  if (viewMode === "cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lists.map((list) => (
          <TodoListCard
            key={list.id}
            list={list}
            onDelete={() => deleteList(list.id)}
            onTogglePin={() => togglePin(list.id)}
            onArchive={() => archiveList(list.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lists.map((list) => (
        <TodoListRow
          key={list.id}
          list={list}
          isExpanded={expandedListId === list.id}
          onToggleExpand={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
          onDelete={() => deleteList(list.id)}
          onTogglePin={() => togglePin(list.id)}
          onArchive={() => archiveList(list.id)}
        />
      ))}
    </div>
  );
}
