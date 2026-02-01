import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  Clock,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameDay,
} from "date-fns";
import { useCalendarEvents, CalendarEvent } from "@/hooks/useCalendarEvents";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarAgendaView } from "@/components/calendar/CalendarAgendaView";
import { CalendarFiltersPanel, CalendarActiveFilters } from "@/components/calendar/CalendarFilters";
import { AddCalendarEventDialog } from "@/components/calendar/AddCalendarEventDialog";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useTasks } from "@/hooks/useTasks";
import { toast } from "sonner";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTaskDetailModal } from "@/contexts/TaskDetailModalContext";

type ViewMode = "month" | "week" | "day" | "agenda";

const CalendarPage = () => {
  const { openTask } = useTaskDetailModal();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedHour, setSelectedHour] = useState<number | undefined>();

  const { staffMembers } = useActiveStaff();
  const { updateTask, addTask } = useTasks();

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<any>(null);

  const {
    events,
    eventsByDate,
    getEventsForDate,
    loading,
    filters,
    setFilters,
    refetch,
  } = useCalendarEvents(currentDate, view);

  const staffList = staffMembers.map((s) => ({
    id: s.id,
    name: s.name || s.email || "",
  }));

  const navigatePrevious = () => {
    switch (view) {
      case "month":
        setCurrentDate(subMonths(currentDate, 1));
        break;
      case "week":
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case "day":
      case "agenda":
        setCurrentDate(subDays(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case "month":
        setCurrentDate(addMonths(currentDate, 1));
        break;
      case "week":
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case "day":
      case "agenda":
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    if (view === "month") {
      setView("day");
    }
  };

  const handleTimeSlotClick = (date: Date, hour: number) => {
    setSelectedDate(date);
    setSelectedHour(hour);
    setAddEventOpen(true);
  };

  const handleDayTimeSlotClick = (hour: number) => {
    setSelectedDate(currentDate);
    setSelectedHour(hour);
    setAddEventOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.source === "task") {
      openTask(event.sourceId);
      return;
    }
    // Other event types can be handled later (e.g., open edit dialog)
  };

  const handleEventComplete = async (event: CalendarEvent) => {
    if (event.source === "task") {
      try {
        // Fetch task so we can enforce completion workflow here too.
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", event.sourceId)
          .single();

        if (error) throw error;
        setTaskToComplete(data);
        setCompleteDialogOpen(true);
      } catch (error) {
        toast.error("Failed to complete task");
      }
    }
  };

  const getHeaderTitle = () => {
    switch (view) {
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "week":
        return `Week of ${format(currentDate, "MMMM d, yyyy")}`;
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "agenda":
        return "Upcoming Events";
      default:
        return format(currentDate, "MMMM yyyy");
    }
  };

  const dayEvents = view === "day" ? getEventsForDate(currentDate) : [];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Calendar</h1>
            <p className="text-muted-foreground">
              Schedule and manage appointments, follow-ups, and events
            </p>
          </div>
          <Button onClick={() => {
            setSelectedDate(new Date());
            setSelectedHour(9);
            setAddEventOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Event
          </Button>
        </div>

        {/* Main Calendar Card */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 border-b">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={navigateNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <h2 className="text-lg font-semibold min-w-[200px]">
                  {getHeaderTitle()}
                </h2>
              </div>

              {/* View Switcher & Filters */}
              <div className="flex items-center gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                  <TabsList>
                    <TabsTrigger value="month" className="gap-1">
                      <LayoutGrid className="h-4 w-4" />
                      <span className="hidden sm:inline">Month</span>
                    </TabsTrigger>
                    <TabsTrigger value="week" className="gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Week</span>
                    </TabsTrigger>
                    <TabsTrigger value="day" className="gap-1">
                      <Clock className="h-4 w-4" />
                      <span className="hidden sm:inline">Day</span>
                    </TabsTrigger>
                    <TabsTrigger value="agenda" className="gap-1">
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">Agenda</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <CalendarFiltersPanel
                  filters={filters}
                  onFiltersChange={setFilters}
                  staffList={staffList}
                />
              </div>
            </div>

            {/* Active Filters */}
            <CalendarActiveFilters filters={filters} onFiltersChange={setFilters} />
          </CardHeader>

          <CardContent className="flex-1 p-0 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="h-full">
                {view === "month" && (
                  <CalendarMonthView
                    currentDate={currentDate}
                    events={events}
                    eventsByDate={eventsByDate}
                    onDateClick={handleDateClick}
                    onEventClick={handleEventClick}
                  />
                )}
                {view === "week" && (
                  <CalendarWeekView
                    currentDate={currentDate}
                    events={events}
                    eventsByDate={eventsByDate}
                    onTimeSlotClick={handleTimeSlotClick}
                    onEventClick={handleEventClick}
                  />
                )}
                {view === "day" && (
                  <CalendarDayView
                    currentDate={currentDate}
                    events={dayEvents}
                    onTimeSlotClick={handleDayTimeSlotClick}
                    onEventClick={handleEventClick}
                    onEventComplete={handleEventComplete}
                  />
                )}
                {view === "agenda" && (
                  <CalendarAgendaView
                    events={events}
                    onEventClick={handleEventClick}
                    onEventComplete={handleEventComplete}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <CalendarLegend />

        {/* Add Event Dialog */}
        <AddCalendarEventDialog
          open={addEventOpen}
          onOpenChange={setAddEventOpen}
          initialDate={selectedDate}
          initialTime={selectedHour}
          onEventCreated={refetch}
        />
      </div>

      <TaskCompletionDialog
        open={completeDialogOpen}
        onOpenChange={(o) => {
          setCompleteDialogOpen(o);
          if (!o) setTaskToComplete(null);
        }}
        task={taskToComplete}
        updateTask={updateTask}
        addTask={addTask}
      />
    </DashboardLayout>
  );
};

export default CalendarPage;
