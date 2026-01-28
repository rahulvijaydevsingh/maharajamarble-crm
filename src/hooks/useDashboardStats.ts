import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format, isAfter, parseISO, isToday, isBefore } from "date-fns";

export interface DashboardStats {
  totalLeads: number;
  leadsThisMonth: number;
  leadsTrend: number;
  conversionRate: number;
  conversionTrend: number;
  pendingTasks: number;
  overdueTasks: number;
  activeCustomers: number;
  customersTrend: number;
  upcomingReminders: number;
  leadSources: { name: string; value: number }[];
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    leadsThisMonth: 0,
    leadsTrend: 0,
    conversionRate: 0,
    conversionTrend: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    activeCustomers: 0,
    customersTrend: 0,
    upcomingReminders: 0,
    leadSources: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const startThisMonth = startOfMonth(now);
      const endThisMonth = endOfMonth(now);
      const startLastMonth = startOfMonth(subMonths(now, 1));
      const endLastMonth = endOfMonth(subMonths(now, 1));

      // Fetch leads
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, created_at, source, is_converted");
      
      if (leadsError) throw leadsError;

      const totalLeads = leads?.length || 0;
      const leadsThisMonth = leads?.filter(l => {
        const createdAt = parseISO(l.created_at);
        return isAfter(createdAt, startThisMonth) && isBefore(createdAt, endThisMonth);
      }).length || 0;

      const leadsLastMonth = leads?.filter(l => {
        const createdAt = parseISO(l.created_at);
        return isAfter(createdAt, startLastMonth) && isBefore(createdAt, endLastMonth);
      }).length || 0;

      const leadsTrend = leadsLastMonth > 0 
        ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100) 
        : leadsThisMonth > 0 ? 100 : 0;

      // Conversion rate
      const convertedLeads = leads?.filter(l => l.is_converted).length || 0;
      const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

      // Lead sources distribution
      const sourceCount: { [key: string]: number } = {};
      leads?.forEach(l => {
        const source = l.source || "other";
        sourceCount[source] = (sourceCount[source] || 0) + 1;
      });
      const leadSources = Object.entries(sourceCount)
        .map(([name, count]) => ({
          name: name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          value: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Fetch tasks
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("id, status, due_date");
      
      if (tasksError) throw tasksError;

      const today = format(now, "yyyy-MM-dd");
      const pendingTasks = tasks?.filter(t => 
        t.status !== "Completed" && 
        (isToday(parseISO(t.due_date)) || isAfter(parseISO(t.due_date), now) || t.due_date === today)
      ).length || 0;

      const overdueTasks = tasks?.filter(t => 
        t.status !== "Completed" && 
        isBefore(parseISO(t.due_date), now) && 
        t.due_date !== today
      ).length || 0;

      // Fetch customers
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("id, status, created_at");
      
      if (customersError) throw customersError;

      const activeCustomers = customers?.filter(c => c.status === "active").length || 0;
      
      const customersThisMonth = customers?.filter(c => {
        const createdAt = parseISO(c.created_at);
        return isAfter(createdAt, startThisMonth) && isBefore(createdAt, endThisMonth);
      }).length || 0;

      const customersLastMonth = customers?.filter(c => {
        const createdAt = parseISO(c.created_at);
        return isAfter(createdAt, startLastMonth) && isBefore(createdAt, endLastMonth);
      }).length || 0;

      const customersTrend = customersLastMonth > 0 
        ? Math.round(((customersThisMonth - customersLastMonth) / customersLastMonth) * 100)
        : customersThisMonth > 0 ? 100 : 0;

      // Fetch reminders
      const { data: reminders, error: remindersError } = await supabase
        .from("reminders")
        .select("id, is_dismissed, reminder_datetime")
        .eq("is_dismissed", false);
      
      if (remindersError) throw remindersError;

      const upcomingReminders = reminders?.filter(r => 
        isAfter(parseISO(r.reminder_datetime), now) || 
        format(parseISO(r.reminder_datetime), "yyyy-MM-dd") === today
      ).length || 0;

      setStats({
        totalLeads,
        leadsThisMonth,
        leadsTrend,
        conversionRate,
        conversionTrend: 0, // Would need historical data
        pendingTasks: pendingTasks + overdueTasks,
        overdueTasks,
        activeCustomers,
        customersTrend,
        upcomingReminders,
        leadSources,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return { stats, loading, refetch: fetchStats };
}
