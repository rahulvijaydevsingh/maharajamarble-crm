import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Bell, Calendar, Clock, MoreHorizontal, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';
import { useReminders } from '@/hooks/useReminders';
import { useLogActivity } from '@/hooks/useActivityLog';
import { AddReminderDialog } from '@/components/leads/detail-tabs/AddReminderDialog';
import { format, isPast, isToday, isTomorrow, addHours, addDays } from 'date-fns';

interface CustomerRemindersTabProps {
  customer: Customer;
}

export function CustomerRemindersTab({ customer }: CustomerRemindersTabProps) {
  const { reminders, loading, addReminder, dismissReminder, snoozeReminder, deleteReminder } = useReminders('customer', customer.id);
  const { logActivity } = useLogActivity();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);

  const activeReminders = reminders.filter(r => !r.is_dismissed);
  const dismissedReminders = reminders.filter(r => r.is_dismissed);

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
        entity_type: 'customer',
        entity_id: customer.id,
        created_by: 'Current User',
        assigned_to: data.assigned_to,
      });

      // Log activity for reminder creation
      await logActivity({
        customer_id: customer.id,
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
      customer_id: customer.id,
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
      customer_id: customer.id,
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
      customer_id: customer.id,
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
        <h3 className="text-lg font-semibold">Reminders ({activeReminders.length})</h3>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} disabled={savingReminder}>
          <Plus className="h-4 w-4 mr-1" />
          Add Reminder
        </Button>
      </div>

      {activeReminders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No active reminders</p>
            <Button variant="outline" className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Reminder
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeReminders.map((reminder) => (
            <Card key={reminder.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{reminder.title}</p>
                      {reminder.description && (
                        <p className="text-sm text-muted-foreground">{reminder.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className={getTimeBadgeColor(reminder.reminder_datetime)}>
                          {getTimeLabel(reminder.reminder_datetime)}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(reminder.reminder_datetime), 'PPP')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(reminder.reminder_datetime), 'p')}
                        </span>
                        {reminder.is_recurring && (
                          <Badge variant="outline" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {reminder.recurrence_pattern}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
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
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDismissReminder(reminder)}
                    >
                      Dismiss
                    </Button>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dismissedReminders.length > 0 && (
        <div className="mt-8">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Dismissed ({dismissedReminders.length})</h4>
          <div className="space-y-2">
            {dismissedReminders.slice(0, 5).map((reminder) => (
              <Card key={reminder.id} className="opacity-60">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm line-through">{reminder.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(reminder.reminder_datetime), 'PPP')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <AddReminderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleAddReminder}
        entityName={customer.name}
      />
    </div>
  );
}