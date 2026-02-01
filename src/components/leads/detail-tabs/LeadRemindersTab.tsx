import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Plus, Calendar, Clock, MoreHorizontal, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Lead } from '@/hooks/useLeads';
import { useReminders } from '@/hooks/useReminders';
import { useTasks } from '@/hooks/useTasks';
import { useTaskDetailModal } from '@/contexts/TaskDetailModalContext';
import { useLogActivity } from '@/hooks/useActivityLog';
import { AddReminderDialog } from './AddReminderDialog';
import { format, isPast, isToday, isTomorrow, addHours, addDays } from 'date-fns';

interface LeadRemindersTabProps {
  lead: Lead;
  highlightReminderId?: string | null;
}

export function LeadRemindersTab({ lead, highlightReminderId }: LeadRemindersTabProps) {
  const { reminders, loading, addReminder, dismissReminder, snoozeReminder, deleteReminder } = useReminders('lead', lead.id);
  const { tasks } = useTasks();
  const { openTask } = useTaskDetailModal();
  const { logActivity } = useLogActivity();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightReminderId || null);

  const leadTaskReminders = React.useMemo(() => {
    return tasks
      .filter((t) => t.lead_id === lead.id && !!t.reminder && t.status !== 'Completed')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [tasks, lead.id]);

  // Scroll to and highlight the reminder when highlightReminderId is provided
  React.useEffect(() => {
    if (highlightReminderId && reminders.length > 0) {
      setHighlightedId(highlightReminderId);
      // Scroll to the reminder element
      setTimeout(() => {
        const element = document.getElementById(`reminder-${highlightReminderId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      // Remove highlight after 3 seconds
      setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
    }
  }, [highlightReminderId, reminders]);

  const handleAddReminder = async (data: {
    title: string;
    description: string;
    reminder_datetime: string;
    is_recurring: boolean;
    recurrence_pattern: string | null;
    recurrence_end_date: string | null;
    assigned_to: string;
  }) => {
    if (savingReminder) return; // Prevent double submission
    
    setSavingReminder(true);
    try {
      const result = await addReminder({
        title: data.title,
        description: data.description,
        reminder_datetime: data.reminder_datetime,
        is_recurring: data.is_recurring,
        recurrence_pattern: data.recurrence_pattern as "daily" | "weekly" | "monthly" | "yearly" | null,
        recurrence_end_date: data.recurrence_end_date,
        entity_type: 'lead',
        entity_id: lead.id,
        created_by: 'Current User',
        assigned_to: data.assigned_to,
      });

      // Log activity for reminder creation
      await logActivity({
        lead_id: lead.id,
        activity_type: 'reminder_created',
        activity_category: 'reminder',
        title: `Reminder Created: ${data.title}`,
        description: `Reminder set for ${format(new Date(data.reminder_datetime), 'PPP p')}${data.is_recurring ? ` (Recurring: ${data.recurrence_pattern})` : ''}`,
        metadata: {
          reminder_id: result?.id,
          reminder_title: data.title,
          reminder_datetime: data.reminder_datetime,
          is_recurring: data.is_recurring,
          recurrence_pattern: data.recurrence_pattern,
          assigned_to: data.assigned_to,
        },
        related_entity_type: 'reminder',
        related_entity_id: result?.id,
      });
      
      setAddDialogOpen(false);
    } catch (error) {
      // Error already handled in addReminder
    } finally {
      setSavingReminder(false);
    }
  };

  const handleDismissReminder = async (reminder: typeof reminders[0]) => {
    await dismissReminder(reminder.id);
    
    // Log activity
    await logActivity({
      lead_id: lead.id,
      activity_type: 'reminder_dismissed',
      activity_category: 'reminder',
      title: `Reminder Dismissed: ${reminder.title}`,
      description: `Reminder was scheduled for ${format(new Date(reminder.reminder_datetime), 'PPP p')}`,
      metadata: {
        reminder_id: reminder.id,
        reminder_title: reminder.title,
        original_datetime: reminder.reminder_datetime,
      },
      related_entity_type: 'reminder',
      related_entity_id: reminder.id,
    });
  };

  const handleSnoozeReminder = async (reminder: typeof reminders[0], snoozeUntil: Date, snoozeLabel: string) => {
    await snoozeReminder(reminder.id, snoozeUntil);
    
    // Log activity
    await logActivity({
      lead_id: lead.id,
      activity_type: 'reminder_snoozed',
      activity_category: 'reminder',
      title: `Reminder Snoozed: ${reminder.title}`,
      description: `Original time: ${format(new Date(reminder.reminder_datetime), 'PPP p')}. Snoozed to: ${format(snoozeUntil, 'PPP p')} (${snoozeLabel})`,
      metadata: {
        reminder_id: reminder.id,
        reminder_title: reminder.title,
        original_datetime: reminder.reminder_datetime,
        snoozed_until: snoozeUntil.toISOString(),
        snooze_duration: snoozeLabel,
      },
      related_entity_type: 'reminder',
      related_entity_id: reminder.id,
    });
  };

  const handleDeleteReminder = async (reminder: typeof reminders[0]) => {
    await deleteReminder(reminder.id);
    
    // Log activity
    await logActivity({
      lead_id: lead.id,
      activity_type: 'reminder_deleted',
      activity_category: 'reminder',
      title: `Reminder Deleted: ${reminder.title}`,
      description: `Reminder was scheduled for ${format(new Date(reminder.reminder_datetime), 'PPP p')}`,
      metadata: {
        reminder_id: reminder.id,
        reminder_title: reminder.title,
        reminder_datetime: reminder.reminder_datetime,
      },
      related_entity_type: 'reminder',
      related_entity_id: reminder.id,
    });
  };

  const getTimeLabel = (datetime: string) => {
    const date = new Date(datetime);
    if (isPast(date)) return 'Overdue';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d, yyyy');
  };

  const getTimeBadgeColor = (datetime: string) => {
    const date = new Date(datetime);
    if (isPast(date)) return 'bg-red-100 text-red-700';
    if (isToday(date)) return 'bg-yellow-100 text-yellow-700';
    if (isTomorrow(date)) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Reminders</h3>
        <Button onClick={() => setAddDialogOpen(true)} disabled={savingReminder}>
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>

      {leadTaskReminders.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Task reminders</h4>
          {leadTaskReminders.map((task) => (
            <div key={task.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <Button
                    variant="link"
                    className="h-auto p-0 font-medium"
                    onClick={() => openTask(task.id)}
                  >
                    {task.title}
                  </Button>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Badge variant="outline" className="text-xs">
                      Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
                    </Badge>
                    {task.reminder_time && (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {task.reminder_time}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No reminders set for this lead.</p>
          <p className="text-sm mt-1">Create a reminder to get notified about follow-ups.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              id={`reminder-${reminder.id}`}
              className={`border rounded-lg p-4 flex items-center justify-between transition-all duration-500 ${
                highlightedId === reminder.id ? 'ring-2 ring-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{reminder.title}</p>
                  {reminder.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{reminder.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Badge variant="secondary" className={getTimeBadgeColor(reminder.reminder_datetime)}>
                      {getTimeLabel(reminder.reminder_datetime)}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(reminder.reminder_datetime), 'h:mm a')}</span>
                    </div>
                    {reminder.is_recurring && (
                      <Badge variant="outline" className="text-xs">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {reminder.recurrence_pattern}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDismissReminder(reminder)}>
                  Dismiss
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Snooze
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleSnoozeReminder(reminder, addHours(new Date(), 1), '1 hour')}>
                      1 hour
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSnoozeReminder(reminder, addHours(new Date(), 3), '3 hours')}>
                      3 hours
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSnoozeReminder(reminder, addDays(new Date(), 1), 'Tomorrow')}>
                      Tomorrow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSnoozeReminder(reminder, addDays(new Date(), 7), 'Next week')}>
                      Next week
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDeleteReminder(reminder)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddReminderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleAddReminder}
        entityName={lead.name}
      />
    </div>
  );
}