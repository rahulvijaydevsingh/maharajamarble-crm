import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, parseISO, differenceInHours } from "date-fns";

export interface StaffPerformance {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string | null;
  leadsCreated: number;
  leadsConverted: number;
  leadsLost: number;
  conversionRate: number;
  tasksCompleted: number;
  tasksOverdue: number;
  tasksPending: number;
  avgTaskCompletionHours: number | null;
  customersCreated: number;
  quotationsCreated: number;
  totalActivities: number;
}

export interface PerformanceOverview {
  totalLeadsCreated: number;
  totalLeadsConverted: number;
  totalTasksCompleted: number;
  totalQuotations: number;
  avgConversionRate: number;
  topPerformer: string | null;
}

export function usePerformanceStats(period: "this_month" | "last_month" | "last_3_months" | "all_time" = "this_month") {
  const [staffStats, setStaffStats] = useState<StaffPerformance[]>([]);
  const [overview, setOverview] = useState<PerformanceOverview>({
    totalLeadsCreated: 0, totalLeadsConverted: 0, totalTasksCompleted: 0,
    totalQuotations: 0, avgConversionRate: 0, topPerformer: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformanceData();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "this_month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month": return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case "last_3_months": return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case "all_time": return { start: null, end: null };
    }
  };

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      // Fetch all profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .eq("is_active", true);

      if (!profiles?.length) { setLoading(false); return; }

      // Fetch roles
      const roleMap: Record<string, string> = {};
      for (const p of profiles) {
        const { data: r } = await supabase.rpc("get_user_role", { _user_id: p.id });
        if (r) roleMap[p.id] = r as string;
      }

      // Build queries with optional date filters
      let leadsQuery = supabase.from("leads").select("id, created_by, status, is_converted, created_at, lost_at");
      let tasksQuery = supabase.from("tasks").select("id, assigned_to, status, created_at, completed_at, due_date");
      let customersQuery = supabase.from("customers").select("id, created_by, created_at");
      let quotationsQuery = supabase.from("quotations").select("id, created_by, created_at");

      if (start && end) {
        const s = start.toISOString();
        const e = end.toISOString();
        leadsQuery = leadsQuery.gte("created_at", s).lte("created_at", e);
        tasksQuery = tasksQuery.gte("created_at", s).lte("created_at", e);
        customersQuery = customersQuery.gte("created_at", s).lte("created_at", e);
        quotationsQuery = quotationsQuery.gte("created_at", s).lte("created_at", e);
      }

      const [
        { data: leads },
        { data: tasks },
        { data: customers },
        { data: quotations },
      ] = await Promise.all([leadsQuery, tasksQuery, customersQuery, quotationsQuery]);

      const now = new Date();
      const staffPerf: StaffPerformance[] = profiles.map((p) => {
        const email = p.email || "";
        const name = p.full_name || email;

        const myLeads = (leads || []).filter(l => l.created_by === email || l.created_by === name);
        const leadsCreated = myLeads.length;
        const leadsConverted = myLeads.filter(l => l.is_converted).length;
        const leadsLost = myLeads.filter(l => l.status === "lost").length;

        const myTasks = (tasks || []).filter(t => t.assigned_to === email || t.assigned_to === name);
        const tasksCompleted = myTasks.filter(t => t.status === "Completed").length;
        const tasksOverdue = myTasks.filter(t =>
          t.status !== "Completed" && t.status !== "Cancelled" &&
          t.due_date && new Date(t.due_date) < now
        ).length;
        const tasksPending = myTasks.filter(t =>
          t.status !== "Completed" && t.status !== "Cancelled"
        ).length;

        const completedWithTime = myTasks.filter(t => t.completed_at && t.created_at);
        const avgHours = completedWithTime.length > 0
          ? completedWithTime.reduce((sum, t) =>
              sum + differenceInHours(parseISO(t.completed_at!), parseISO(t.created_at)), 0
            ) / completedWithTime.length
          : null;

        const customersCreated = (customers || []).filter(c => c.created_by === email || c.created_by === name).length;
        const quotationsCreated = (quotations || []).filter(q => q.created_by === email || q.created_by === name).length;

        return {
          staffId: p.id,
          staffName: name,
          staffEmail: email,
          role: roleMap[p.id] || null,
          leadsCreated,
          leadsConverted,
          leadsLost,
          conversionRate: leadsCreated > 0 ? Math.round((leadsConverted / leadsCreated) * 100) : 0,
          tasksCompleted,
          tasksOverdue,
          tasksPending,
          avgTaskCompletionHours: avgHours ? Math.round(avgHours) : null,
          customersCreated,
          quotationsCreated,
          totalActivities: leadsCreated + tasksCompleted + customersCreated + quotationsCreated,
        };
      });

      // Sort by total activities desc
      staffPerf.sort((a, b) => b.totalActivities - a.totalActivities);

      const totalLeadsCreated = staffPerf.reduce((s, p) => s + p.leadsCreated, 0);
      const totalLeadsConverted = staffPerf.reduce((s, p) => s + p.leadsConverted, 0);
      const totalTasksCompleted = staffPerf.reduce((s, p) => s + p.tasksCompleted, 0);
      const totalQuotations = staffPerf.reduce((s, p) => s + p.quotationsCreated, 0);

      setStaffStats(staffPerf);
      setOverview({
        totalLeadsCreated,
        totalLeadsConverted,
        totalTasksCompleted,
        totalQuotations,
        avgConversionRate: totalLeadsCreated > 0 ? Math.round((totalLeadsConverted / totalLeadsCreated) * 100) : 0,
        topPerformer: staffPerf[0]?.staffName || null,
      });
    } catch (error) {
      console.error("Error fetching performance stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return { staffStats, overview, loading, refetch: fetchPerformanceData };
}
