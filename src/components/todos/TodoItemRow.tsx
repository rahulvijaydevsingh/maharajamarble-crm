import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Star, Trash2, ArrowRight, MoreHorizontal, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { TodoItem } from "@/hooks/useTodoItems";
import { format } from "date-fns";

interface TodoItemRowProps {
  item: TodoItem;
  onToggleComplete: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
  onConvertToTask: () => void;
  compact?: boolean;
}

export function TodoItemRow({
  item,
  onToggleComplete,
  onToggleStar,
  onDelete,
  onConvertToTask,
  compact = false,
}: TodoItemRowProps) {
  const isConverted = !!item.converted_to_task_id;

  return (
    <div
      className={cn(
        "flex items-center gap-2 group rounded-md transition-colors",
        compact ? "py-1" : "p-2 hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={item.is_completed}
        onCheckedChange={onToggleComplete}
        disabled={isConverted}
      />

      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm truncate block",
            item.is_completed && "line-through text-muted-foreground"
          )}
        >
          {item.title}
        </span>
        {!compact && item.due_date && (
          <span className="text-xs text-muted-foreground">
            Due: {format(new Date(item.due_date), "MMM d")}
          </span>
        )}
      </div>

      {isConverted && (
        <Badge variant="outline" className="text-xs gap-1">
          <Link className="h-3 w-3" />
          Task
        </Badge>
      )}

      {item.is_starred && (
        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
      )}

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 w-7 p-0", item.is_starred && "text-yellow-500")}
          onClick={onToggleStar}
        >
          <Star className={cn("h-3.5 w-3.5", item.is_starred && "fill-current")} />
        </Button>

        {!isConverted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onConvertToTask}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Convert to Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
