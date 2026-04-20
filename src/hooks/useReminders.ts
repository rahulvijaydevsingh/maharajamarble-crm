import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logToStaffActivity } from "@/lib/staffActivityLogger";
import { useRemindersChannel, RemindersRealtimePayload } from '@/contexts/RemindersContext';

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  reminder_datetime: string;
  is_dismissed: boolean;
  is_snoozed: boolean;
  snooze_until: string | null;
  entity_type: "lead" | "customer" | "professional" | "task" | "quotation";
  entity_id: string;
  is_recurring: boolean;
  recurrence_pattern: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrence_end_date: string | null;
  created_by: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
}

export interface ReminderInsert {
  title: string;
  description?: string | null;
  reminder_datetime: string;
  entity_type: "lead" | "customer" | "professional" | "task" | "quotation";
  entity_id: string;
  is_recurring?: boolean;
  recurrence_pattern?: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrence_end_date?: string | null;
  created_by?: string;
  assigned_to: string;
}

export function useReminders(entityType?: string, entityId?: string, assignedTo?: string) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const remindersChannel = useRemindersChannel();

  const fetchReminders = async () => {
    try {
      setLoading(true);
      const nowISO = new Date().toISOString();
      let query = supabase
        .from("reminders")
        .select("*")
        .eq("is_dismissed", false)
        .order("reminder_datetime", { ascending: true });

      // Only filter by datetime if we're NOT in entity-specific tab mode
      if (!entityType || !entityId) {
        query = query.lte("reminder_datetime", nowISO);
      }

      if (entityType && entityId) {
        query = query.eq("entity_type", entityType).eq("entity_id", entityId);
      } else if (assignedTo) {
        query = query.eq("assigned_to", assignedTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReminders(data as Reminder[] || []);
    } catch (error: any) {
      toast({
        title: "Error fetching reminders",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addReminder = async (reminder: ReminderInsert) => {
    try {
      // Don't pass created_by — let DB default handle it
      const { created_by: _cb, ...reminderWithoutCb } = reminder as any;
      const { data, error } = await supabase
        .from("reminders")
        .insert([reminderWithoutCb])
        .select()
        .single();

      if (error) throw error;

      const newReminder = data as Reminder;
      const isDue = new Date(newReminder.reminder_datetime) <= new Date();

      // Add to local state if in entity-tab mode OR if it's already due
      if ((entityType && entityId) || isDue) {
        setReminders((prev) => {
          if (prev.some((r) => r.id === newReminder.id)) return prev;
          return [...prev, newReminder].sort((a, b) =>
            a.reminder_datetime.localeCompare(b.reminder_datetime)
          );
        });
      }

      toast({ title: "Reminder created" });
      // Log to staff activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity("create_reminder", u.email || "", u.id, `Created reminder: ${reminder.title}`, reminder.entity_type, reminder.entity_id);
        }
      } catch (_) {}
      return data;
    } catch (error: any) {
      toast({
        title: "Error adding reminder",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    try {
      const { data, error } = await supabase
        .from("reminders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setReminders((prev) =>
        prev.map((reminder) => (reminder.id === id ? (data as Reminder) : reminder))
      );
      return data;
    } catch (error: any) {
      toast({
        title: "Error updating reminder",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const dismissReminder = async (id: string) => {
    try {
      const reminderToDismiss = reminders.find(r => r.id === id);
      await updateReminder(id, { is_dismissed: true });
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Reminder dismissed" });
      // Log to staff activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity("dismiss_reminder", u.email || "", u.id, `Dismissed reminder: ${reminderToDismiss?.title || id}`, reminderToDismiss?.entity_type, reminderToDismiss?.entity_id);
        }
      } catch (_) {}
    } catch (error) {
      // Error already handled in updateReminder
    }
  };

  const snoozeReminder = async (id: string, snoozeUntil: Date) => {
    try {
      await updateReminder(id, {
        is_snoozed: true,
        snooze_until: snoozeUntil.toISOString(),
      });
      toast({ title: "Reminder snoozed", description: `Until ${snoozeUntil.toLocaleString()}` });
    } catch (error) {
      // Error already handled in updateReminder
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) throw error;
      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
      toast({ title: "Reminder deleted" });
    } catch (error: any) {
      toast({
        title: "Error deleting reminder",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchReminders();

    // Handler logic shared between context path and fallback path
    const handlePayload = (payload: RemindersRealtimePayload) => {
      if (payload.eventType === 'INSERT') {
        const newReminder = payload.new as Reminder;
        const matchesEntity =
          !entityType ||
          (newReminder.entity_type === entityType &&
            newReminder.entity_id === entityId);
        const matchesAssignee =
          !assignedTo || newReminder.assigned_to === assignedTo;
        const isDue =
          new Date(newReminder.reminder_datetime) <= new Date();
        const shouldAdd = (entityType && entityId) || isDue;

        if (matchesEntity && matchesAssignee && shouldAdd) {
          setReminders((prev) => {
            if (prev.some((r) => r.id === newReminder.id)) return prev;
            return [...prev, newReminder].sort((a, b) =>
              a.reminder_datetime.localeCompare(b.reminder_datetime)
            );
          });
        }
      } else if (payload.eventType === 'UPDATE') {
        setReminders((prev) =>
          prev.map((reminder) =>
            reminder.id === payload.new.id
              ? (payload.new as Reminder)
              : reminder
          )
        );
      } else if (payload.eventType === 'DELETE') {
        setReminders((prev) =>
          prev.filter((reminder) => reminder.id !== payload.old.id)
        );
      }
    };

    if (remindersChannel) {
      // Use shared context channel — no new Supabase subscription
      remindersChannel.addListener(handlePayload);
      return () => {
        remindersChannel.removeListener(handlePayload);
      };
    } else {
      // Fallback: create own channel (RemindersProvider not in tree)
      const channel = supabase
        .channel(`reminders-fallback-${Date.now()}-${Math.random()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminders' },
          (payload) => handlePayload(payload as RemindersRealtimePayload)
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [entityType, entityId, assignedTo]);

  return {
    reminders,
    loading,
    addReminder,
    updateReminder,
    dismissReminder,
    snoozeReminder,
    deleteReminder,
    refetch: fetchReminders,
  };
}
