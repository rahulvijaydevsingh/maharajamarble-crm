import React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "@/hooks/useCalendarEvents";
import { CalendarEventCard } from "./CalendarEventCard";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView({
  currentDate,
  events,
  onDateClick,
  onEventClick,
  eventsByDate,
}: CalendarMonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDate = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return eventsByDate[dateKey] || [];
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, idx) => {
            const dayEvents = getEventsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelectedDay = isSameDay(day, currentDate);
            const isTodayDate = isToday(day);
            const maxVisibleEvents = 3;
            const hiddenCount = Math.max(0, dayEvents.length - maxVisibleEvents);

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[100px] border-r border-b last:border-r-0 p-1 cursor-pointer hover:bg-accent/30 transition-colors",
                  !isCurrentMonth && "bg-muted/30",
                  isSelectedDay && "bg-accent/50"
                )}
                onClick={() => onDateClick(day)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "w-7 h-7 flex items-center justify-center text-sm rounded-full",
                      isTodayDate && "bg-primary text-primary-foreground font-bold",
                      !isCurrentMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayEvents.length > 0 && (
                    <Badge variant="secondary" className="text-xs h-5">
                      {dayEvents.length}
                    </Badge>
                  )}
                </div>

                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, maxVisibleEvents).map((event) => (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      variant="compact"
                      onClick={() => onEventClick(event)}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <div className="text-xs text-muted-foreground text-center py-0.5">
                      +{hiddenCount} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
