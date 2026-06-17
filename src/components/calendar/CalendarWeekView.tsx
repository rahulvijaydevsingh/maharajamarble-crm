import React from "react";
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  isToday,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
} from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "@/hooks/useCalendarEvents";
import { CalendarEventCard } from "./CalendarEventCard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onTimeSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

export function CalendarWeekView({
  currentDate,
  events,
  onTimeSlotClick,
  onEventClick,
  eventsByDate,
}: CalendarWeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getEventsForDateAndHour = (date: Date, hour: number) => {
    const dateKey = format(date, "yyyy-MM-dd");
    const dayEvents = eventsByDate[dateKey] || [];
    return dayEvents.filter((event) => {
      const eventHour = getHours(event.start);
      return eventHour === hour;
    });
  };

  const getAllDayEvents = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    const dayEvents = eventsByDate[dateKey] || [];
    return dayEvents.filter((event) => event.allDay);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full border rounded-lg overflow-hidden">
        {/* Header with day names */}
        <div className="flex border-b bg-muted/30">
          <div className="w-16 flex-shrink-0 border-r" />
          {weekDays.map((day, idx) => (
            <div
              key={idx}
              className={cn(
                "flex-1 py-2 text-center border-r last:border-r-0",
                isToday(day) && "bg-primary/10"
              )}
            >
              <div className="text-sm font-medium text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  isToday(day) && "text-primary"
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* All-day events row */}
        <div className="flex border-b bg-muted/20">
          <div className="w-16 flex-shrink-0 border-r py-1 px-2 text-xs text-muted-foreground">
            All Day
          </div>
          {weekDays.map((day, idx) => {
            const allDayEvents = getAllDayEvents(day);
            return (
              <div
                key={idx}
                className="flex-1 min-h-[40px] p-1 border-r last:border-r-0 space-y-0.5"
              >
                {allDayEvents.map((event) => (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    variant="compact"
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <ScrollArea className="flex-1">
          <div className="flex">
            {/* Time labels */}
            <div className="w-16 flex-shrink-0 border-r">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-16 border-b last:border-b-0 px-2 text-xs text-muted-foreground flex items-start justify-end pt-1"
                >
                  {format(setHours(setMinutes(new Date(), 0), hour), "h a")}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => (
              <div
                key={dayIdx}
                className={cn(
                  "flex-1 border-r last:border-r-0",
                  isToday(day) && "bg-primary/5"
                )}
              >
                {HOURS.map((hour) => {
                  const hourEvents = getEventsForDateAndHour(day, hour);
                  return (
                    <div
                      key={hour}
                      className="h-16 border-b last:border-b-0 p-0.5 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => onTimeSlotClick(day, hour)}
                    >
                      <div className="space-y-0.5 overflow-hidden h-full">
                        {hourEvents.slice(0, 2).map((event) => (
                          <CalendarEventCard
                            key={event.id}
                            event={event}
                            variant="compact"
                            onClick={() => onEventClick(event)}
                          />
                        ))}
                        {hourEvents.length > 2 && (
                          <div className="text-[10px] text-muted-foreground text-center">
                            +{hourEvents.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
