import React from "react";
import { getAllEventTypes } from "@/hooks/useCalendarEvents";
import { cn } from "@/lib/utils";

export function CalendarLegend() {
  const eventTypes = getAllEventTypes();

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg">
      {eventTypes.map((type) => (
        <div key={type.value} className="flex items-center gap-2">
          <span className={cn("w-3 h-3 rounded-full", type.color)} />
          <span className="text-sm">{type.icon} {type.label}</span>
        </div>
      ))}
    </div>
  );
}
