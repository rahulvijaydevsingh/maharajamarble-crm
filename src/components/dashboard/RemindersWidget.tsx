import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Clock, Check, ChevronRight, Users, ChevronDown } from "lucide-react";
import { format, parseISO, isPast, isToday, isTomorrow, differenceInHours } from "date-fns";
import { useReminders } from "@/hooks/useReminders";
import { useNavigate } from "react-router-dom";
import { useTaskDetailModal } from "@/contexts/TaskDetailModalContext";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveStaffOptions } from "@/hooks/useActiveStaff";
import { cn } from "@/lib/utils";

export function RemindersWidget() {
  const { profile, isAdmin } = useAuth();
  const admin = isAdmin();
  const { options: staffOptions } = useActiveStaffOptions();

  // Admin can pick multiple staff (empty = all); non-admins are locked to self.
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // When admin selects exactly one staff, query layer can filter directly.
  // For multi-select (>1), fetch all and post-filter in memory.
  const effectiveAssignee = admin
    ? selectedStaff.length === 1
      ? selectedStaff[0]
      : undefined
    : profile?.full_name || undefined;

  const { reminders, loading, dismissReminder } = useReminders(undefined, undefined, effectiveAssignee);
  const navigate = useNavigate();
  const { openTask } = useTaskDetailModal();

  const activeReminders = useMemo(() => {
    let list = reminders.filter((r) => !r.is_dismissed);
    if (admin && selectedStaff.length > 1) {
      const set = new Set(selectedStaff);
      list = list.filter((r) => set.has(r.assigned_to));
    }
    return list;
  }, [reminders, admin, selectedStaff]);

  const sortedReminders = useMemo(
    () =>
      [...activeReminders].sort(
        (a, b) =>
          new Date(a.reminder_datetime).getTime() - new Date(b.reminder_datetime).getTime()
      ),
    [activeReminders]
  );

  const visibleReminders = showAll ? sortedReminders : sortedReminders.slice(0, 5);

  const getTimeLabel = (datetime: string) => {
    const date = parseISO(datetime);
    if (isPast(date)) return "Overdue";
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isTomorrow(date)) return `Tomorrow at ${format(date, "h:mm a")}`;
    return format(date, "MMM d, h:mm a");
  };

  const getTimeBadgeVariant = (datetime: string): "destructive" | "default" | "secondary" => {
    const date = parseISO(datetime);
    if (isPast(date)) return "destructive";
    const hoursUntil = differenceInHours(date, new Date());
    if (hoursUntil <= 2) return "default";
    return "secondary";
  };

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await dismissReminder(id);
  };

  const handleReminderClick = (reminder: any) => {
    const type = reminder.entity_type?.toLowerCase();
    if (type === "lead") {
      navigate(`/leads?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    } else if (type === "customer") {
      navigate(`/customers?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    } else if (type === "task") {
      openTask(reminder.entity_id);
    } else if (type === "professional") {
      navigate(`/professionals?view=${reminder.entity_id}`);
    }
  };

  const toggleStaff = (name: string) => {
    setSelectedStaff((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const staffTriggerLabel =
    selectedStaff.length === 0
      ? "All Users"
      : selectedStaff.length === 1
      ? selectedStaff[0]
      : `${selectedStaff.length} users`;

  if (loading) {
    return (
      <Card className="marble-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="marble-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            Reminders
          </CardTitle>
          <div className="flex items-center gap-2">
            {admin && staffOptions.length > 0 && (
              <Popover open={staffOpen} onOpenChange={setStaffOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-[180px] justify-between text-xs"
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Users className="h-3 w-3 shrink-0" />
                      <span className="truncate">{staffTriggerLabel}</span>
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[240px] p-0">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium">Filter by user</span>
                    {selectedStaff.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedStaff([])}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="max-h-[280px]">
                    <div className="p-1">
                      {staffOptions.map((opt) => {
                        const checked = selectedStaff.includes(opt.name);
                        return (
                          <label
                            key={opt.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleStaff(opt.name)}
                            />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
            {activeReminders.length > 0 && (
              <Badge variant="secondary">{activeReminders.length}</Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {admin && selectedStaff.length === 1
            ? `Showing reminders for ${selectedStaff[0]}`
            : admin && selectedStaff.length > 1
            ? `Showing reminders for ${selectedStaff.length} selected users`
            : admin
            ? "Showing reminders for all users"
            : "Upcoming and overdue reminders"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sortedReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Check className="h-8 w-8 mb-2" />
            <p>No pending reminders</p>
          </div>
        ) : (
          <ScrollArea className={cn(showAll ? "h-[420px]" : "h-[220px]", "pr-2")}>
            <div className="space-y-3">
              {visibleReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  onClick={() => handleReminderClick(reminder)}
                  className={cn(
                    "p-3 rounded-lg border transition-colors cursor-pointer",
                    isPast(parseISO(reminder.reminder_datetime))
                      ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{reminder.title}</p>
                      {reminder.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {reminder.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant={getTimeBadgeVariant(reminder.reminder_datetime)} className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {getTimeLabel(reminder.reminder_datetime)}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => handleDismiss(reminder.id, e)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {sortedReminders.length > 5 && (
          <Button
            variant="link"
            className="w-full mt-2 text-xs"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Show fewer reminders"
              : `View all ${sortedReminders.length} reminders`}
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
