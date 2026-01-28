import React from "react";
import { format } from "date-fns";
import { Clock, User, MapPin, CheckCircle2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarEvent, getEventTypeConfig } from "@/hooks/useCalendarEvents";

interface CalendarEventCardProps {
  event: CalendarEvent;
  variant?: "compact" | "full" | "agenda";
  onClick?: () => void;
  onComplete?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewRelated?: () => void;
}

const priorityStyles: Record<string, string> = {
  High: "border-l-4 border-l-red-500",
  Medium: "border-l-4 border-l-yellow-500",
  Low: "border-l-4 border-l-green-500",
};

const statusStyles: Record<string, string> = {
  Completed: "opacity-60 line-through",
  Cancelled: "opacity-40",
  Snoozed: "bg-muted/50",
};

export function CalendarEventCard({
  event,
  variant = "compact",
  onClick,
  onComplete,
  onEdit,
  onDelete,
  onViewRelated,
}: CalendarEventCardProps) {
  const config = getEventTypeConfig(event.type);

  if (variant === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "text-xs px-1.5 py-1 rounded cursor-pointer truncate text-white font-medium",
              config.color,
              event.status && statusStyles[event.status]
            )}
            onClick={onClick}
          >
            <span className="mr-1">{config.icon}</span>
            {event.title}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(event.start, "h:mm a")}
              {event.end && ` - ${format(event.end, "h:mm a")}`}
            </p>
            {event.description && (
              <p className="text-xs">{event.description}</p>
            )}
            {event.assignedTo && (
              <p className="text-xs">Assigned: {event.assignedTo}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === "full") {
    return (
      <div
        className={cn(
          "p-3 rounded-lg border bg-card cursor-pointer hover:shadow-md transition-shadow",
          priorityStyles[event.priority || ""],
          event.status && statusStyles[event.status]
        )}
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("w-2 h-2 rounded-full", config.color)} />
              <span className="font-medium truncate">{event.title}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(event.start, "h:mm a")}
                {event.end && ` - ${format(event.end, "h:mm a")}`}
              </span>
              
              {event.assignedTo && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {event.assignedTo}
                </span>
              )}
            </div>

            {event.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {event.description}
              </p>
            )}

            {event.relatedEntityType && event.relatedEntityId && (
              <Badge variant="secondary" className="mt-2 text-xs">
                {event.relatedEntityType}: {event.relatedEntityName || event.relatedEntityId.slice(0, 8)}
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover z-50">
              {event.source === "task" && onComplete && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onComplete(); }}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark Complete
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  Edit Event
                </DropdownMenuItem>
              )}
              {onViewRelated && event.relatedEntityId && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewRelated(); }}>
                  View Related Record
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Agenda variant
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-pointer",
        priorityStyles[event.priority || ""],
        event.status && statusStyles[event.status]
      )}
      onClick={onClick}
    >
      <div className="flex flex-col items-center min-w-[60px]">
        <span className="text-lg font-semibold">
          {format(event.start, "h:mm")}
        </span>
        <span className="text-xs text-muted-foreground">
          {format(event.start, "a")}
        </span>
      </div>

      <div className={cn("w-1 self-stretch rounded", config.color)} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{config.icon}</span>
              <h4 className="font-medium">{event.title}</h4>
              <Badge variant="outline" className="text-xs">
                {config.label}
              </Badge>
            </div>
            
            {event.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {event.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              {event.assignedTo && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {event.assignedTo}
                </span>
              )}
              {event.relatedEntityType && (
                <span className="flex items-center gap-1">
                  Related: {event.relatedEntityType}
                </span>
              )}
              {event.priority && (
                <Badge 
                  variant={event.priority === "High" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {event.priority}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {event.source === "task" && onComplete && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onComplete(); }}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Complete
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover z-50">
                {onEdit && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    Edit
                  </DropdownMenuItem>
                )}
                {onViewRelated && event.relatedEntityId && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewRelated(); }}>
                    View Related
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
