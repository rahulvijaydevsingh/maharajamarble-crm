import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Clock, Check, ChevronRight, AlertCircle } from "lucide-react";
import { format, parseISO, isPast, isToday, isTomorrow, differenceInHours } from "date-fns";
import { useReminders } from "@/hooks/useReminders";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function RemindersWidget() {
  const { reminders, loading, dismissReminder } = useReminders();
  const navigate = useNavigate();
  
  const activeReminders = reminders.filter(r => !r.is_dismissed);
  const sortedReminders = activeReminders.sort((a, b) => 
    new Date(a.reminder_datetime).getTime() - new Date(b.reminder_datetime).getTime()
  ).slice(0, 5);

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
    // Navigate to the lead or customer detail view with the reminders tab highlighted
    if (reminder.entity_type === 'lead') {
      navigate(`/leads?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    } else if (reminder.entity_type === 'customer') {
      navigate(`/customers?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    }
  };

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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            Reminders
          </CardTitle>
          {activeReminders.length > 0 && (
            <Badge variant="secondary">{activeReminders.length}</Badge>
          )}
        </div>
        <CardDescription>Upcoming and overdue reminders</CardDescription>
      </CardHeader>
      <CardContent>
        {sortedReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Check className="h-8 w-8 mb-2" />
            <p>No pending reminders</p>
          </div>
        ) : (
          <ScrollArea className="h-[220px] pr-2">
            <div className="space-y-3">
              {sortedReminders.map((reminder) => (
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
        {activeReminders.length > 5 && (
          <Button variant="link" className="w-full mt-2 text-xs">
            View all {activeReminders.length} reminders
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
