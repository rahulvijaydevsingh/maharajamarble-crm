import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  variant?: "compact" | "full";
}

export function TodoItemRow({
  item,
  onToggleComplete,
  onToggleStar,
  onDelete,
  onConvertToTask,
  variant = "full",
}: TodoItemRowProps) {
  const isConverted = !!item.converted_to_task_id;
  const isCompact = variant === "compact";

  const title = (
    <span
      className={cn(
        "block text-sm break-words",
        isCompact && "line-clamp-2",
        item.is_completed && "line-through text-muted-foreground"
      )}
    >
      {item.title}
    </span>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 group rounded-md transition-colors",
        "group",
        isCompact ? "py-1.5" : "py-1.5 px-2 hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={item.is_completed}
        onCheckedChange={onToggleComplete}
        disabled={isConverted}
      />

      <div className="flex-1 min-w-0">
        {isCompact ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>{title}</TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">{item.title}</TooltipContent>
          </Tooltip>
        ) : title}
        {!isCompact && item.notes && (
          <span className="mt-0.5 block text-xs text-muted-foreground break-words">{item.notes}</span>
        )}
        {!isCompact && item.due_date && (
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

      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
