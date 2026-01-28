import React from "react";
import {
  format,
  setHours,
  setMinutes,
  getHours,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "@/hooks/useCalendarEvents";
import { CalendarEventCard } from "./CalendarEventCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";

interface CalendarDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onTimeSlotClick: (hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventComplete?: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export function CalendarDayView({
  currentDate,
  events,
  onTimeSlotClick,
  onEventClick,
  onEventComplete,
}: CalendarDayViewProps) {
  const dayEvents = events;
  const allDayEvents = dayEvents.filter((event) => event.allDay);
  const timedEvents = dayEvents.filter((event) => !event.allDay);

  const getEventsForHour = (hour: number) => {
    return timedEvents.filter((event) => {
      const eventHour = getHours(event.start);
      return eventHour === hour;
    });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full border rounded-lg overflow-hidden">
        {/* Date header */}
        <div className={cn(
          "py-4 px-6 border-b text-center",
          isToday(currentDate) && "bg-primary/10"
        )}>
          <div className="text-sm text-muted-foreground">
            {format(currentDate, "EEEE")}
          </div>
          <div className={cn(
            "text-3xl font-bold",
            isToday(currentDate) && "text-primary"
          )}>
            {format(currentDate, "MMMM d, yyyy")}
          </div>
        </div>

        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div className="border-b p-3 bg-muted/20">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              All Day Events
            </div>
            <div className="space-y-2">
              {allDayEvents.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  variant="full"
                  onClick={() => onEventClick(event)}
                  onComplete={event.source === "task" ? () => onEventComplete?.(event) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Time slots */}
        <ScrollArea className="flex-1">
          <div className="relative">
            {HOURS.map((hour) => {
              const hourEvents = getEventsForHour(hour);
              const isBusinessHour = hour >= 9 && hour <= 18;

              return (
                <div
                  key={hour}
                  className={cn(
                    "flex min-h-[80px] border-b last:border-b-0",
                    isBusinessHour ? "bg-background" : "bg-muted/20"
                  )}
                >
                  {/* Time label */}
                  <div className="w-20 flex-shrink-0 border-r px-3 py-2 text-sm text-muted-foreground">
                    {format(setHours(setMinutes(new Date(), 0), hour), "h:mm a")}
                  </div>

                  {/* Event area */}
                  <div
                    className="flex-1 p-2 cursor-pointer hover:bg-accent/20 transition-colors"
                    onClick={() => onTimeSlotClick(hour)}
                  >
                    <div className="space-y-2">
                      {hourEvents.map((event) => (
                        <CalendarEventCard
                          key={event.id}
                          event={event}
                          variant="full"
                          onClick={() => onEventClick(event)}
                          onComplete={event.source === "task" ? () => onEventComplete?.(event) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
