import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subWeeks, startOfDay, endOfDay, startOfQuarter, parseISO, differenceInHours } from "date-fns";

export type PeriodType = "today" | "this_week" | "this_month" | "last_month" | "this_quarter" | "last_3_months" | "all_time";

export interface PerformanceMetrics {
  // Calls & Communication
  directCallsMade: number;
  callTasksCompleted: number;
  totalCalls: number;
  followUpsCompleted: number;

  // Visits & Meetings
  siteVisitsCompleted: number;
  meetingsHeld: number;

  // Leads
  leadsAssigned: number;
  leadsCreated: number;
  leadsConverted: number;
  conversionRate: number;

  // Quotations
  quotationsCreated: number;
  quotationsSent: number;
  quotationsWon: number;
  quotationsLost: number;
  winRate: number;
  avgQuotationValue: number | null;
  totalRevenuePipeline: number;

  // Tasks
  tasksCompleted: number;
  tasksOverdue: number;
  tasksPending: number;
  taskCompletionRate: number;
  avgTaskCompletionHours: number | null;

  // Overall
  totalActivities: number;
  loginCount: number;
  daysActive: number;
  activityScore: number;
}

export interface StaffMetrics extends PerformanceMetrics {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string | null;
}

interface DateRange {
  start: Date | null;
  end: Date | null;
}

function getDateRange(period: PeriodType): DateRange {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month":
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case "this_quarter":
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case "last_3_months":
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case "all_time":
      return { start: null, end: null };
  }
}

// Map our task type constants to spec categories
const CALL_TASK_TYPES = ["Follow-up Call", "KIT Call"];
const VISIT_TASK_TYPES = ["Site Visit", "KIT Visit"];
const MEETING_TASK_TYPES = ["Follow-up Meeting", "KIT Meeting"];
const FOLLOWUP_TASK_TYPES = ["Follow-up Call", "Follow-up Meeting", "Feedback Collection"];

export function usePerformanceMetrics(
  staffId: string | null,
  period: PeriodType = "this_month"
) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    if (!staffId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { start, end } = getDateRange(period);

      // Get staff profile for name/email matching
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", staffId)
        .single();

      const staffName = profile?.full_name || "";
      const staffEmail = profile?.email || "";

      // Parallel queries
      const dateFilter = (query: any) => {
        if (start && end) {
          return query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
        }
        return query;
      };

      // Staff activity log queries
      let activityQuery = (supabase.from("staff_activity_log" as any).select("*") as any)
        .eq("user_id", staffId);
      if (start && end) {
        activityQuery = activityQuery.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }

      // Tasks query - match by assigned_to (name or email)
      let tasksQuery = supabase.from("tasks").select("id, type, status, created_at, completed_at, due_date, assigned_to");
      if (start && end) {
        tasksQuery = tasksQuery.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }

      // Leads query
      let leadsAssignedQuery = supabase.from("leads").select("id, status, is_converted, assigned_to, created_by, created_at, deleted_at");
      if (start && end) {
        leadsAssignedQuery = leadsAssignedQuery.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }

      // Quotations query
      let quotationsQuery = supabase.from("quotations").select("id, status, total, created_by, assigned_to, created_at");
      if (start && end) {
        quotationsQuery = quotationsQuery.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }

      const [
        { data: activities },
        { data: allTasks },
        { data: allLeads },
        { data: allQuotations },
      ] = await Promise.all([activityQuery, tasksQuery, leadsAssignedQuery, quotationsQuery]);

      const staffActivities = (activities || []) as any[];

      // Filter tasks/leads/quotations for this staff
      const isMyEntity = (entityAssignedTo: string, entityCreatedBy?: string) => {
        return entityAssignedTo === staffEmail || entityAssignedTo === staffName ||
          (entityCreatedBy && (entityCreatedBy === staffEmail || entityCreatedBy === staffName));
      };

      const myTasks = (allTasks || []).filter((t: any) => t.assigned_to === staffEmail || t.assigned_to === staffName);
      const myLeadsAssigned = (allLeads || []).filter((l: any) => l.assigned_to === staffEmail || l.assigned_to === staffName);
      const myLeadsCreated = (allLeads || []).filter((l: any) => l.created_by === staffEmail || l.created_by === staffName);
      const myQuotations = (allQuotations || []).filter((q: any) => q.created_by === staffEmail || q.created_by === staffName || q.assigned_to === staffEmail || q.assigned_to === staffName);

      const now = new Date();

      // Calls
      const directCallsMade = staffActivities.filter((a: any) => a.action_type === "call_made").length;
      const callTasksCompleted = myTasks.filter((t: any) => CALL_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
      const totalCalls = directCallsMade + callTasksCompleted;

      // Visits & Meetings
      const siteVisitsCompleted = myTasks.filter((t: any) => VISIT_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
      const meetingsHeld = myTasks.filter((t: any) => MEETING_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
      const followUpsCompleted = myTasks.filter((t: any) => FOLLOWUP_TASK_TYPES.includes(t.type) && t.status === "Completed").length;

      // Leads
      const leadsAssigned = myLeadsAssigned.length;
      const leadsCreated = myLeadsCreated.length;
      const leadsConverted = myLeadsAssigned.filter((l: any) => l.is_converted).length;
      const conversionRate = leadsAssigned > 0 ? Math.round((leadsConverted / leadsAssigned) * 100) : 0;

      // Quotations
      const quotationsCreated = myQuotations.length;
      const quotationsSent = myQuotations.filter((q: any) => q.status === "sent").length;
      const quotationsWon = myQuotations.filter((q: any) => q.status === "accepted" || q.status === "won").length;
      const quotationsLost = myQuotations.filter((q: any) => q.status === "rejected" || q.status === "lost").length;
      const winRate = (quotationsWon + quotationsLost) > 0 ? Math.round((quotationsWon / (quotationsWon + quotationsLost)) * 100) : 0;
      const wonQuotations = myQuotations.filter((q: any) => q.status === "accepted" || q.status === "won");
      const avgQuotationValue = wonQuotations.length > 0
        ? Math.round(wonQuotations.reduce((s: number, q: any) => s + (q.total || 0), 0) / wonQuotations.length)
        : null;
      const totalRevenuePipeline = myQuotations
        .filter((q: any) => q.status === "draft" || q.status === "sent")
        .reduce((s: number, q: any) => s + (q.total || 0), 0);

      // Tasks
      const tasksCompleted = myTasks.filter((t: any) => t.status === "Completed").length;
      const tasksOverdue = myTasks.filter((t: any) =>
        t.status !== "Completed" && t.status !== "Cancelled" &&
        t.due_date && new Date(t.due_date) < now
      ).length;
      const tasksPending = myTasks.filter((t: any) =>
        t.status !== "Completed" && t.status !== "Cancelled"
      ).length;
      const totalTasks = tasksCompleted + tasksPending;
      const taskCompletionRate = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

      const completedWithTime = myTasks.filter((t: any) => t.completed_at && t.created_at && t.status === "Completed");
      const avgTaskCompletionHours = completedWithTime.length > 0
        ? Math.round(completedWithTime.reduce((sum: number, t: any) =>
            sum + differenceInHours(parseISO(t.completed_at), parseISO(t.created_at)), 0
          ) / completedWithTime.length)
        : null;

      // Overall
      const loginCount = staffActivities.filter((a: any) => a.action_type === "login").length;
      const daysActive = new Set(
        staffActivities.map((a: any) => a.created_at?.slice(0, 10))
      ).size;

      const totalActivities = totalCalls + siteVisitsCompleted + meetingsHeld + tasksCompleted + leadsCreated + quotationsCreated;

      // Activity Score (simplified composite, 0-100)
      // Weighted: calls 25%, visits 20%, task completion 20%, quotations 15%, conversion 20%
      const callScore = Math.min(totalCalls / Math.max(10, 1), 1) * 25;
      const visitScore = Math.min(siteVisitsCompleted / Math.max(4, 1), 1) * 20;
      const taskScore = (taskCompletionRate / 100) * 20;
      const quoteScore = Math.min(quotationsCreated / Math.max(8, 1), 1) * 15;
      const convScore = (conversionRate / 100) * 20;
      const activityScore = Math.min(Math.round(callScore + visitScore + taskScore + quoteScore + convScore), 100);

      setMetrics({
        directCallsMade, callTasksCompleted, totalCalls, followUpsCompleted,
        siteVisitsCompleted, meetingsHeld,
        leadsAssigned, leadsCreated, leadsConverted, conversionRate,
        quotationsCreated, quotationsSent, quotationsWon, quotationsLost, winRate, avgQuotationValue, totalRevenuePipeline,
        tasksCompleted, tasksOverdue, tasksPending, taskCompletionRate, avgTaskCompletionHours,
        totalActivities, loginCount, daysActive, activityScore,
      });
    } catch (error) {
      console.error("Error fetching performance metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [staffId, period]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, refetch: fetchMetrics };
}

// Fetch metrics for ALL staff (admin leaderboard)
export function useAllStaffMetrics(period: PeriodType = "this_month") {
  const [staffMetrics, setStaffMetrics] = useState<StaffMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [period]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange(period);

      // Fetch all active profiles
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

      // Fetch all data in parallel
      let actQuery = (supabase.from("staff_activity_log" as any).select("*") as any);
      let tasksQuery = supabase.from("tasks").select("id, type, status, created_at, completed_at, due_date, assigned_to");
      let leadsQuery = supabase.from("leads").select("id, status, is_converted, assigned_to, created_by, created_at");
      let quotationsQuery = supabase.from("quotations").select("id, status, total, created_by, assigned_to, created_at");

      if (start && end) {
        const s = start.toISOString();
        const e = end.toISOString();
        actQuery = actQuery.gte("created_at", s).lte("created_at", e);
        tasksQuery = tasksQuery.gte("created_at", s).lte("created_at", e);
        leadsQuery = leadsQuery.gte("created_at", s).lte("created_at", e);
        quotationsQuery = quotationsQuery.gte("created_at", s).lte("created_at", e);
      }

      const [{ data: activities }, { data: tasks }, { data: leads }, { data: quotations }] = await Promise.all([
        actQuery, tasksQuery, leadsQuery, quotationsQuery,
      ]);

      const now = new Date();

      const results: StaffMetrics[] = profiles.map((p) => {
        const name = p.full_name || p.email || "";
        const email = p.email || "";
        const staffActs = ((activities || []) as any[]).filter((a: any) => a.user_id === p.id);
        const myTasks = (tasks || []).filter((t: any) => t.assigned_to === email || t.assigned_to === name);
        const myLeads = (leads || []).filter((l: any) => l.assigned_to === email || l.assigned_to === name);
        const myLeadsCreated = (leads || []).filter((l: any) => l.created_by === email || l.created_by === name);
        const myQuotes = (quotations || []).filter((q: any) => q.created_by === email || q.created_by === name || q.assigned_to === email || q.assigned_to === name);

        const directCallsMade = staffActs.filter((a: any) => a.action_type === "call_made").length;
        const callTasksCompleted = myTasks.filter((t: any) => CALL_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
        const totalCalls = directCallsMade + callTasksCompleted;
        const siteVisitsCompleted = myTasks.filter((t: any) => VISIT_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
        const meetingsHeld = myTasks.filter((t: any) => MEETING_TASK_TYPES.includes(t.type) && t.status === "Completed").length;
        const followUpsCompleted = myTasks.filter((t: any) => FOLLOWUP_TASK_TYPES.includes(t.type) && t.status === "Completed").length;

        const leadsAssigned = myLeads.length;
        const leadsCreated = myLeadsCreated.length;
        const leadsConverted = myLeads.filter((l: any) => l.is_converted).length;
        const conversionRate = leadsAssigned > 0 ? Math.round((leadsConverted / leadsAssigned) * 100) : 0;

        const quotationsCreated = myQuotes.length;
        const quotationsSent = myQuotes.filter((q: any) => q.status === "sent").length;
        const quotationsWon = myQuotes.filter((q: any) => q.status === "accepted" || q.status === "won").length;
        const quotationsLost = myQuotes.filter((q: any) => q.status === "rejected" || q.status === "lost").length;
        const winRate = (quotationsWon + quotationsLost) > 0 ? Math.round((quotationsWon / (quotationsWon + quotationsLost)) * 100) : 0;
        const wonQ = myQuotes.filter((q: any) => q.status === "accepted" || q.status === "won");
        const avgQuotationValue = wonQ.length > 0 ? Math.round(wonQ.reduce((s: number, q: any) => s + (q.total || 0), 0) / wonQ.length) : null;
        const totalRevenuePipeline = myQuotes.filter((q: any) => q.status === "draft" || q.status === "sent").reduce((s: number, q: any) => s + (q.total || 0), 0);

        const tasksCompleted = myTasks.filter((t: any) => t.status === "Completed").length;
        const tasksOverdue = myTasks.filter((t: any) => t.status !== "Completed" && t.status !== "Cancelled" && t.due_date && new Date(t.due_date) < now).length;
        const tasksPending = myTasks.filter((t: any) => t.status !== "Completed" && t.status !== "Cancelled").length;
        const totalTaskCount = tasksCompleted + tasksPending;
        const taskCompletionRate = totalTaskCount > 0 ? Math.round((tasksCompleted / totalTaskCount) * 100) : 0;

        const completedWithTime = myTasks.filter((t: any) => t.completed_at && t.created_at && t.status === "Completed");
        const avgTaskCompletionHours = completedWithTime.length > 0
          ? Math.round(completedWithTime.reduce((sum: number, t: any) => sum + differenceInHours(parseISO(t.completed_at), parseISO(t.created_at)), 0) / completedWithTime.length)
          : null;

        const loginCount = staffActs.filter((a: any) => a.action_type === "login").length;
        const daysActive = new Set(staffActs.map((a: any) => a.created_at?.slice(0, 10))).size;
        const totalActivities = totalCalls + siteVisitsCompleted + meetingsHeld + tasksCompleted + leadsCreated + quotationsCreated;

        const callScore = Math.min(totalCalls / 10, 1) * 25;
        const visitScore = Math.min(siteVisitsCompleted / 4, 1) * 20;
        const taskScore = (taskCompletionRate / 100) * 20;
        const quoteScore = Math.min(quotationsCreated / 8, 1) * 15;
        const convScore = (conversionRate / 100) * 20;
        const activityScore = Math.min(Math.round(callScore + visitScore + taskScore + quoteScore + convScore), 100);

        return {
          staffId: p.id, staffName: name, staffEmail: email, role: roleMap[p.id] || null,
          directCallsMade, callTasksCompleted, totalCalls, followUpsCompleted,
          siteVisitsCompleted, meetingsHeld,
          leadsAssigned, leadsCreated, leadsConverted, conversionRate,
          quotationsCreated, quotationsSent, quotationsWon, quotationsLost, winRate, avgQuotationValue, totalRevenuePipeline,
          tasksCompleted, tasksOverdue, tasksPending, taskCompletionRate, avgTaskCompletionHours,
          totalActivities, loginCount, daysActive, activityScore,
        };
      });

      results.sort((a, b) => b.activityScore - a.activityScore);
      setStaffMetrics(results);
    } catch (error) {
      console.error("Error fetching all staff metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  return { staffMetrics, loading, refetch: fetchAll };
}

// Fetch performance targets
export function usePerformanceTargets(staffId?: string) {
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTargets();
  }, [staffId]);

  const fetchTargets = async () => {
    try {
      // Get global defaults first, then individual overrides
      const { data: globalTargets } = await supabase
        .from("performance_targets" as any)
        .select("*")
        .is("staff_id", null) as any;

      const map: Record<string, number> = {};
      (globalTargets || []).forEach((t: any) => {
        map[t.metric_key] = Number(t.target_value);
      });

      if (staffId) {
        const { data: staffTargets } = await supabase
          .from("performance_targets" as any)
          .select("*")
          .eq("staff_id", staffId) as any;

        (staffTargets || []).forEach((t: any) => {
          map[t.metric_key] = Number(t.target_value);
        });
      }

      setTargets(map);
    } catch (error) {
      console.error("Error fetching performance targets:", error);
    } finally {
      setLoading(false);
    }
  };

  return { targets, loading, refetch: fetchTargets };
}
