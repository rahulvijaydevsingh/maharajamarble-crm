import React from "react";
import { Search, X, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CalendarFilters as Filters,
  CalendarEventType,
  getAllEventTypes,
} from "@/hooks/useCalendarEvents";
import { cn } from "@/lib/utils";

interface CalendarFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  staffList: { id: string; name: string }[];
}

const STATUS_OPTIONS = ["Pending", "In Progress", "Completed", "Cancelled", "Snoozed"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];

export function CalendarFiltersPanel({
  filters,
  onFiltersChange,
  staffList,
}: CalendarFiltersProps) {
  const eventTypes = getAllEventTypes();
  const activeFilterCount = 
    filters.eventTypes.length + 
    filters.assignedTo.length + 
    filters.status.length + 
    filters.priority.length;

  const toggleEventType = (type: CalendarEventType) => {
    const newTypes = filters.eventTypes.includes(type)
      ? filters.eventTypes.filter((t) => t !== type)
      : [...filters.eventTypes, type];
    onFiltersChange({ ...filters, eventTypes: newTypes });
  };

  const toggleAssignedTo = (id: string) => {
    const newAssigned = filters.assignedTo.includes(id)
      ? filters.assignedTo.filter((a) => a !== id)
      : [...filters.assignedTo, id];
    onFiltersChange({ ...filters, assignedTo: newAssigned });
  };

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatus });
  };

  const togglePriority = (priority: string) => {
    const newPriority = filters.priority.includes(priority)
      ? filters.priority.filter((p) => p !== priority)
      : [...filters.priority, priority];
    onFiltersChange({ ...filters, priority: newPriority });
  };

  const clearFilters = () => {
    onFiltersChange({
      eventTypes: [],
      assignedTo: [],
      status: [],
      priority: [],
      search: "",
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-popover z-50" align="end">
        <ScrollArea className="h-[400px]">
          <div className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={filters.search}
                onChange={(e) =>
                  onFiltersChange({ ...filters, search: e.target.value })
                }
                className="pl-9"
              />
            </div>

            <Separator />

            {/* Event Types */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <span className="text-sm font-medium">Event Type</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {eventTypes.map((type) => (
                  <div key={type.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`type-${type.value}`}
                      checked={filters.eventTypes.includes(type.value)}
                      onCheckedChange={() => toggleEventType(type.value)}
                    />
                    <Label
                      htmlFor={`type-${type.value}`}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <span className={cn("w-2 h-2 rounded-full", type.color)} />
                      {type.label}
                    </Label>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        eventTypes: eventTypes.map((t) => t.value),
                      })
                    }
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onFiltersChange({ ...filters, eventTypes: [] })}
                  >
                    Clear
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Assigned To */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <span className="text-sm font-medium">Assigned To</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {staffList.map((staff) => (
                  <div key={staff.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`staff-${staff.id}`}
                      checked={filters.assignedTo.includes(staff.name)}
                      onCheckedChange={() => toggleAssignedTo(staff.name)}
                    />
                    <Label
                      htmlFor={`staff-${staff.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {staff.name}
                    </Label>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Status */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <span className="text-sm font-medium">Status</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {STATUS_OPTIONS.map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={filters.status.includes(status)}
                      onCheckedChange={() => toggleStatus(status)}
                    />
                    <Label
                      htmlFor={`status-${status}`}
                      className="text-sm cursor-pointer"
                    >
                      {status}
                    </Label>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Priority */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <span className="text-sm font-medium">Priority</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {PRIORITY_OPTIONS.map((priority) => (
                  <div key={priority} className="flex items-center gap-2">
                    <Checkbox
                      id={`priority-${priority}`}
                      checked={filters.priority.includes(priority)}
                      onCheckedChange={() => togglePriority(priority)}
                    />
                    <Label
                      htmlFor={`priority-${priority}`}
                      className="text-sm cursor-pointer"
                    >
                      {priority}
                    </Label>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        <Separator />
        <div className="p-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CalendarActiveFilters({
  filters,
  onFiltersChange,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}) {
  const eventTypes = getAllEventTypes();
  const hasFilters =
    filters.eventTypes.length > 0 ||
    filters.assignedTo.length > 0 ||
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.search;

  if (!hasFilters) return null;

  const removeEventType = (type: CalendarEventType) => {
    onFiltersChange({
      ...filters,
      eventTypes: filters.eventTypes.filter((t) => t !== type),
    });
  };

  const removeAssigned = (name: string) => {
    onFiltersChange({
      ...filters,
      assignedTo: filters.assignedTo.filter((a) => a !== name),
    });
  };

  const removeStatus = (status: string) => {
    onFiltersChange({
      ...filters,
      status: filters.status.filter((s) => s !== status),
    });
  };

  const removePriority = (priority: string) => {
    onFiltersChange({
      ...filters,
      priority: filters.priority.filter((p) => p !== priority),
    });
  };

  const clearAll = () => {
    onFiltersChange({
      eventTypes: [],
      assignedTo: [],
      status: [],
      priority: [],
      search: "",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-sm text-muted-foreground">Filters:</span>

      {filters.search && (
        <Badge variant="secondary" className="gap-1">
          Search: "{filters.search}"
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onFiltersChange({ ...filters, search: "" })}
          />
        </Badge>
      )}

      {filters.eventTypes.map((type) => {
        const typeInfo = eventTypes.find((t) => t.value === type);
        return (
          <Badge key={type} variant="secondary" className="gap-1">
            {typeInfo?.label || type}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => removeEventType(type)}
            />
          </Badge>
        );
      })}

      {filters.assignedTo.map((name) => (
        <Badge key={name} variant="secondary" className="gap-1">
          {name}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => removeAssigned(name)}
          />
        </Badge>
      ))}

      {filters.status.map((status) => (
        <Badge key={status} variant="secondary" className="gap-1">
          {status}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => removeStatus(status)}
          />
        </Badge>
      ))}

      {filters.priority.map((priority) => (
        <Badge key={priority} variant="secondary" className="gap-1">
          {priority}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => removePriority(priority)}
          />
        </Badge>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs text-muted-foreground"
        onClick={clearAll}
      >
        Clear all
      </Button>
    </div>
  );
}
