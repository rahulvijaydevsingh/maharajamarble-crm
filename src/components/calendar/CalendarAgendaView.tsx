import React, { useMemo } from "react";
import {
  format,
  isToday,
  isTomorrow,
  startOfDay,
  differenceInDays,
} from "date-fns";
import { CalendarEvent } from "@/hooks/useCalendarEvents";
import { CalendarEventCard } from "./CalendarEventCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventComplete?: (event: CalendarEvent) => void;
}

interface GroupedEvents {
  date: Date;
  label: string;
  events: CalendarEvent[];
}

export function CalendarAgendaView({
  events,
  onEventClick,
  onEventComplete,
}: CalendarAgendaViewProps) {
  const groupedEvents = useMemo(() => {
    const groups: Record<string, GroupedEvents> = {};

    events.forEach((event) => {
      const dateKey = format(event.start, "yyyy-MM-dd");
      if (!groups[dateKey]) {
        const eventDate = startOfDay(event.start);
        let label = format(eventDate, "EEEE, MMMM d, yyyy");
        
        if (isToday(eventDate)) {
          label = "TODAY - " + format(eventDate, "MMMM d, yyyy");
        } else if (isTomorrow(eventDate)) {
          label = "TOMORROW - " + format(eventDate, "MMMM d, yyyy");
        } else {
          const daysAway = differenceInDays(eventDate, new Date());
          if (daysAway > 0 && daysAway <= 7) {
            label = format(eventDate, "EEEE") + " - " + format(eventDate, "MMMM d, yyyy");
          }
        }

        groups[dateKey] = {
          date: eventDate,
          label,
          events: [],
        };
      }
      groups[dateKey].events.push(event);
    });

    return Object.values(groups).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12">
        <div className="text-4xl mb-4">📅</div>
        <h3 className="text-lg font-medium text-muted-foreground">
          No upcoming events
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your schedule is clear for the next 30 days
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {groupedEvents.map((group) => (
          <div key={format(group.date, "yyyy-MM-dd")}>
            <div
              className={cn(
                "sticky top-0 bg-background py-2 border-b mb-4 z-10",
                isToday(group.date) && "border-primary"
              )}
            >
              <h3
                className={cn(
                  "text-sm font-semibold uppercase tracking-wide",
                  isToday(group.date) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {group.label}
              </h3>
            </div>

            <div className="space-y-3">
              {group.events.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  variant="agenda"
                  onClick={() => onEventClick(event)}
                  onComplete={
                    event.source === "task"
                      ? () => onEventComplete?.(event)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
