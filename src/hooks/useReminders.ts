import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  created_by: string;
  assigned_to: string;
}

export function useReminders(entityType?: string, entityId?: string) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchReminders = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("reminders")
        .select("*")
        .eq("is_dismissed", false)
        .order("reminder_datetime", { ascending: true });

      if (entityType && entityId) {
        query = query.eq("entity_type", entityType).eq("entity_id", entityId);
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
      const { data, error } = await supabase
        .from("reminders")
        .insert([reminder])
        .select()
        .single();

      if (error) throw error;
      setReminders((prev) => [...prev, data as Reminder].sort(
        (a, b) => new Date(a.reminder_datetime).getTime() - new Date(b.reminder_datetime).getTime()
      ));
      toast({ title: "Reminder created" });
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
      await updateReminder(id, { is_dismissed: true });
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Reminder dismissed" });
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

    // Subscribe to realtime changes
    const channel = supabase
      .channel("reminders-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newReminder = payload.new as Reminder;
            if (!entityType || (newReminder.entity_type === entityType && newReminder.entity_id === entityId)) {
              setReminders((prev) => [...prev, newReminder].sort(
                (a, b) => new Date(a.reminder_datetime).getTime() - new Date(b.reminder_datetime).getTime()
              ));
            }
          } else if (payload.eventType === "UPDATE") {
            setReminders((prev) =>
              prev.map((reminder) =>
                reminder.id === payload.new.id ? (payload.new as Reminder) : reminder
              )
            );
          } else if (payload.eventType === "DELETE") {
            setReminders((prev) =>
              prev.filter((reminder) => reminder.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityType, entityId]);

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
