import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, parseISO, isSameDay, format } from "date-fns";

export type CalendarEventType = 
  | "task" 
  | "reminder" 
  | "site-visit" 
  | "call" 
  | "meeting" 
  | "delivery" 
  | "follow-up"
  | "quotation"
  | "kit-touch";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start: Date;
  end?: Date;
  allDay?: boolean;
  type: CalendarEventType;
  priority?: string;
  status?: string;
  assignedTo?: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  relatedEntityName?: string | null;
  source: "task" | "reminder" | "quotation" | "kit_touch";
  sourceId: string;
  color: string;
  icon: string;
}

export interface CalendarFilters {
  eventTypes: CalendarEventType[];
  assignedTo: string[];
  status: string[];
  priority: string[];
  search: string;
}

const EVENT_TYPE_CONFIG: Record<CalendarEventType, { color: string; icon: string; label: string }> = {
  task: { color: "bg-blue-500", icon: "✓", label: "Task" },
  reminder: { color: "bg-pink-500", icon: "🔔", label: "Reminder" },
  "site-visit": { color: "bg-purple-500", icon: "🏗️", label: "Site Visit" },
  call: { color: "bg-teal-500", icon: "📞", label: "Call" },
  meeting: { color: "bg-yellow-500", icon: "👥", label: "Meeting" },
  delivery: { color: "bg-green-500", icon: "🏢", label: "Delivery" },
  "follow-up": { color: "bg-orange-500", icon: "📋", label: "Follow-up" },
  quotation: { color: "bg-amber-500", icon: "📄", label: "Quotation" },
  "kit-touch": { color: "bg-violet-500", icon: "💜", label: "KIT Touch" },
};

export const getEventTypeConfig = (type: CalendarEventType) => {
  return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.task;
};

export const getAllEventTypes = () => Object.entries(EVENT_TYPE_CONFIG).map(([key, value]) => ({
  value: key as CalendarEventType,
  ...value,
}));

function mapTaskTypeToEventType(taskType: string): CalendarEventType {
  const typeMap: Record<string, CalendarEventType> = {
    "site_visit": "site-visit",
    "Site Visit": "site-visit",
    "call": "call",
    "Call": "call",
    "meeting": "meeting",
    "Meeting": "meeting",
    "delivery": "delivery",
    "Delivery": "delivery",
    "follow_up": "follow-up",
    "Follow Up": "follow-up",
    "Follow-Up": "follow-up",
  };
  return typeMap[taskType] || "task";
}

export function useCalendarEvents(viewDate: Date, view: "month" | "week" | "day" | "agenda") {
  const [tasks, setTasks] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [kitTouches, setKitTouches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CalendarFilters>({
    eventTypes: [],
    assignedTo: [],
    status: [],
    priority: [],
    search: "",
  });

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    const now = viewDate || new Date();
    switch (view) {
      case "day":
        return { start: now, end: now };
      case "week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "agenda":
        return { start: now, end: addDays(now, 30) };
      case "month":
      default:
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        // Include days from previous/next month visible in calendar
        return { 
          start: startOfWeek(monthStart), 
          end: endOfWeek(monthEnd) 
        };
    }
  }, [viewDate, view]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(`
          id, title, description, due_date, due_time, type, priority, status, 
          assigned_to, related_entity_type, related_entity_id, completed_at
        `)
        .gte("due_date", startStr)
        .lte("due_date", endStr)
        .order("due_date", { ascending: true });

      if (tasksError) throw tasksError;
      setTasks(tasksData || []);

      // Fetch reminders
      const { data: remindersData, error: remindersError } = await supabase
        .from("reminders")
        .select(`
          id, title, description, reminder_datetime, entity_type, entity_id,
          assigned_to, is_dismissed, is_snoozed, snooze_until
        `)
        .gte("reminder_datetime", `${startStr}T00:00:00`)
        .lte("reminder_datetime", `${endStr}T23:59:59`)
        .eq("is_dismissed", false)
        .order("reminder_datetime", { ascending: true });

      if (remindersError) throw remindersError;
      setReminders(remindersData || []);

      // Fetch quotations (valid_until dates)
      const { data: quotationsData, error: quotationsError } = await supabase
        .from("quotations")
        .select(`
          id, quotation_number, client_name, valid_until, status, assigned_to
        `)
        .not("valid_until", "is", null)
        .gte("valid_until", startStr)
        .lte("valid_until", endStr)
        .in("status", ["Draft", "Sent", "Pending"])
        .order("valid_until", { ascending: true });

      if (quotationsError) throw quotationsError;
      setQuotations(quotationsData || []);

      // Fetch KIT touches
      const { data: kitTouchesData, error: kitTouchesError } = await supabase
        .from("kit_touches")
        .select(`
          id, method, scheduled_date, scheduled_time, assigned_to, status,
          subscription:kit_subscriptions(
            id, entity_type, entity_id, preset:kit_presets(name)
          )
        `)
        .gte("scheduled_date", startStr)
        .lte("scheduled_date", endStr)
        .in("status", ["pending", "snoozed"])
        .order("scheduled_date", { ascending: true });

      if (kitTouchesError) throw kitTouchesError;
      setKitTouches(kitTouchesData || []);

    } catch (error) {
      console.error("Error fetching calendar events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up realtime subscriptions
    const tasksChannel = supabase
      .channel("calendar-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchData)
      .subscribe();

    const remindersChannel = supabase
      .channel("calendar-reminders")
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(remindersChannel);
    };
  }, [dateRange.start.toISOString(), dateRange.end.toISOString()]);

  // Transform data into calendar events
  const events = useMemo(() => {
    const allEvents: CalendarEvent[] = [];

    // Transform tasks
    tasks.forEach((task) => {
      const eventType = mapTaskTypeToEventType(task.type || "task");
      const config = getEventTypeConfig(eventType);
      
      let startDate: Date;
      if (task.due_time) {
        startDate = new Date(`${task.due_date}T${task.due_time}`);
      } else {
        startDate = new Date(`${task.due_date}T09:00:00`);
      }

      allEvents.push({
        id: `task-${task.id}`,
        title: task.title,
        description: task.description,
        start: startDate,
        end: task.due_time ? new Date(startDate.getTime() + 30 * 60000) : undefined,
        allDay: !task.due_time,
        type: eventType,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assigned_to,
        relatedEntityType: task.related_entity_type,
        relatedEntityId: task.related_entity_id,
        source: "task",
        sourceId: task.id,
        color: config.color,
        icon: config.icon,
      });
    });

    // Transform reminders
    reminders.forEach((reminder) => {
      const config = getEventTypeConfig("reminder");
      const startDate = new Date(reminder.reminder_datetime);

      allEvents.push({
        id: `reminder-${reminder.id}`,
        title: reminder.title,
        description: reminder.description,
        start: startDate,
        allDay: false,
        type: "reminder",
        assignedTo: reminder.assigned_to,
        relatedEntityType: reminder.entity_type,
        relatedEntityId: reminder.entity_id,
        source: "reminder",
        sourceId: reminder.id,
        color: config.color,
        icon: config.icon,
        status: reminder.is_snoozed ? "Snoozed" : "Pending",
      });
    });

    // Transform quotations
    quotations.forEach((quotation) => {
      const config = getEventTypeConfig("quotation");
      const startDate = new Date(`${quotation.valid_until}T17:00:00`);

      allEvents.push({
        id: `quotation-${quotation.id}`,
        title: `Quote Expires: ${quotation.quotation_number}`,
        description: `Quotation for ${quotation.client_name} expires today`,
        start: startDate,
        allDay: true,
        type: "quotation",
        assignedTo: quotation.assigned_to,
        relatedEntityName: quotation.client_name,
        source: "quotation",
        sourceId: quotation.id,
        color: config.color,
        icon: config.icon,
        status: quotation.status,
      });
    });

    // Transform KIT touches
    kitTouches.forEach((touch) => {
      const config = getEventTypeConfig("kit-touch");
      const sub = touch.subscription as { id: string; entity_type: string; entity_id: string; preset: { name: string } | null } | null;
      
      let startDate: Date;
      if (touch.scheduled_time) {
        startDate = new Date(`${touch.scheduled_date}T${touch.scheduled_time}`);
      } else {
        startDate = new Date(`${touch.scheduled_date}T10:00:00`);
      }

      const methodLabel = touch.method.charAt(0).toUpperCase() + touch.method.slice(1);
      const presetName = sub?.preset?.name || "Custom";

      allEvents.push({
        id: `kit-${touch.id}`,
        title: `${methodLabel} (${presetName})`,
        description: `KIT ${methodLabel} touch`,
        start: startDate,
        allDay: !touch.scheduled_time,
        type: "kit-touch",
        assignedTo: touch.assigned_to,
        relatedEntityType: sub?.entity_type || null,
        relatedEntityId: sub?.entity_id || null,
        source: "kit_touch",
        sourceId: touch.id,
        color: config.color,
        icon: config.icon,
        status: touch.status === "snoozed" ? "Snoozed" : "Pending",
      });
    });

    return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [tasks, reminders, quotations, kitTouches]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Filter by event type
      if (filters.eventTypes.length > 0 && !filters.eventTypes.includes(event.type)) {
        return false;
      }

      // Filter by assigned to
      if (filters.assignedTo.length > 0 && event.assignedTo && 
          !filters.assignedTo.includes(event.assignedTo)) {
        return false;
      }

      // Filter by status
      if (filters.status.length > 0 && event.status && 
          !filters.status.includes(event.status)) {
        return false;
      }

      // Filter by priority
      if (filters.priority.length > 0 && event.priority && 
          !filters.priority.includes(event.priority)) {
        return false;
      }

      // Filter by search
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(searchLower);
        const matchesDesc = event.description?.toLowerCase().includes(searchLower);
        const matchesRelated = event.relatedEntityName?.toLowerCase().includes(searchLower);
        if (!matchesTitle && !matchesDesc && !matchesRelated) {
          return false;
        }
      }

      return true;
    });
  }, [events, filters]);

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter((event) => isSameDay(event.start, date));
  };

  // Get events grouped by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((event) => {
      const dateKey = format(event.start, "yyyy-MM-dd");
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  }, [filteredEvents]);

  return {
    events: filteredEvents,
    eventsByDate,
    getEventsForDate,
    loading,
    filters,
    setFilters,
    refetch: fetchData,
    dateRange,
  };
}
