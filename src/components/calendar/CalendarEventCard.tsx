import React, { useState } from "react";
import { format, addHours, addDays } from "date-fns";
import { Clock, User, MapPin, CheckCircle2, MoreHorizontal, Phone, MessageCircle, Edit, UserPlus, RefreshCw, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { CalendarEvent, getEventTypeConfig } from "@/hooks/useCalendarEvents";
import { PhoneLink } from "@/components/shared/PhoneLink";
import { PlusCodeLink } from "@/components/shared/PlusCodeLink";
import { getWhatsAppLink } from "@/lib/kitHelpers";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { buildStaffGroups } from "@/lib/staffSelect";

interface CalendarEventCardProps {
  event: CalendarEvent;
  variant?: "compact" | "full" | "agenda";
  onClick?: () => void;
  onComplete?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewRelated?: () => void;
  // KIT-specific actions
  onKitLog?: (event: CalendarEvent) => void;
  onKitSnooze?: (event: CalendarEvent, snoozeUntil: string) => void;
  onKitReschedule?: (event: CalendarEvent, newDate: string) => void;
  onKitReassign?: (event: CalendarEvent, newAssignee: string) => void;
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

const SNOOZE_OPTIONS = [
  { value: '1h', label: '1 hour', getFn: () => addHours(new Date(), 1) },
  { value: '2h', label: '2 hours', getFn: () => addHours(new Date(), 2) },
  { value: '4h', label: '4 hours', getFn: () => addHours(new Date(), 4) },
  { value: 'tomorrow', label: 'Tomorrow', getFn: () => addDays(new Date(), 1) },
];

export function CalendarEventCard({
  event,
  variant = "compact",
  onClick,
  onComplete,
  onEdit,
  onDelete,
  onViewRelated,
  onKitLog,
  onKitSnooze,
  onKitReschedule,
  onKitReassign,
}: CalendarEventCardProps) {
  const config = getEventTypeConfig(event.type);
  const isKitTouch = event.source === "kit_touch";
  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);
  
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState("");

  const handleReschedule = () => {
    if (rescheduleDate && onKitReschedule) {
      onKitReschedule(event, format(rescheduleDate, 'yyyy-MM-dd'));
      setRescheduleOpen(false);
      setRescheduleDate(undefined);
    }
  };

  const handleReassign = () => {
    if (selectedAssignee && onKitReassign) {
      onKitReassign(event, selectedAssignee);
      setReassignOpen(false);
      setSelectedAssignee("");
    }
  };

  // Contact links for KIT touches
  const renderContactLinks = () => {
    if (!isKitTouch) return null;
    
    return (
      <div className="flex items-center gap-2 mt-2">
        {event.touchMethod === 'call' && event.entityPhone && (
          <PhoneLink phone={event.entityPhone} className="text-xs" />
        )}
        {event.touchMethod === 'whatsapp' && event.entityPhone && (
          <a
            href={getWhatsAppLink(event.entityPhone) || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp
          </a>
        )}
        {event.touchMethod === 'visit' && event.entityLocation && (
          <PlusCodeLink plusCode={event.entityLocation} className="text-xs" />
        )}
      </div>
    );
  };

  // KIT-specific dropdown items
  const renderKitActions = () => {
    if (!isKitTouch) return null;

    return (
      <>
        {onKitLog && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onKitLog(event); }}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Log Touch
          </DropdownMenuItem>
        )}
        {onKitSnooze && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Clock className="mr-2 h-4 w-4" />
              Snooze
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {SNOOZE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onKitSnooze(event, opt.getFn().toISOString());
                    }}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}
        {onKitReschedule && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRescheduleOpen(true); }}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            Reschedule
          </DropdownMenuItem>
        )}
        {onKitReassign && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setReassignOpen(true); }}>
            <UserPlus className="mr-2 h-4 w-4" />
            Reassign
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
      </>
    );
  };

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
            {isKitTouch && event.relatedEntityName && (
              <p className="text-xs">Entity: {event.relatedEntityName}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === "full") {
    return (
      <>
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

              {renderContactLinks()}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover z-50">
                {renderKitActions()}
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
                {(onDelete || !isKitTouch) && <DropdownMenuSeparator />}
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

        {/* Reschedule Popover */}
        <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={rescheduleDate}
              onSelect={setRescheduleDate}
              disabled={(date) => date < new Date()}
              className="pointer-events-auto"
            />
            <div className="p-2 border-t">
              <Button size="sm" onClick={handleReschedule} disabled={!rescheduleDate} className="w-full">
                Confirm Reschedule
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Reassign Popover */}
        <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reassign To</Label>
              <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.members.map((member) => (
                        <SelectItem key={member.id} value={member.email || member.id}>
                          {member._display}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleReassign} disabled={!selectedAssignee} className="w-full">
                Confirm Reassign
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </>
    );
  }

  // Agenda variant
  return (
    <>
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
                {event.relatedEntityType && event.relatedEntityName && (
                  <span className="flex items-center gap-1">
                    {event.relatedEntityType}: {event.relatedEntityName}
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

              {renderContactLinks()}
            </div>

            <div className="flex items-center gap-2">
              {isKitTouch && onKitLog && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onKitLog(event); }}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Log
                </Button>
              )}
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
                  {renderKitActions()}
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
                  {(onDelete || !isKitTouch) && <DropdownMenuSeparator />}
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

      {/* Reschedule Popover */}
      <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={rescheduleDate}
            onSelect={setRescheduleDate}
            disabled={(date) => date < new Date()}
            className="pointer-events-auto"
          />
          <div className="p-2 border-t">
            <Button size="sm" onClick={handleReschedule} disabled={!rescheduleDate} className="w-full">
              Confirm Reschedule
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Reassign Popover */}
      <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reassign To</Label>
            <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffGroups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.members.map((member) => (
                      <SelectItem key={member.id} value={member.email || member.id}>
                        {member._display}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleReassign} disabled={!selectedAssignee} className="w-full">
              Confirm Reassign
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
