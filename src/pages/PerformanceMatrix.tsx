import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useAllStaffMetrics, usePerformanceMetrics, usePerformanceTargets, PeriodType } from "@/hooks/usePerformanceMetrics";
import { PerformanceWidget } from "@/components/performance/PerformanceWidget";
import { LeaderboardCard } from "@/components/performance/LeaderboardCard";
import { StaffPerformanceTable } from "@/components/performance/StaffPerformanceTable";
import { PerformanceCharts } from "@/components/performance/PerformanceCharts";
import { TeamOverviewGrid } from "@/components/performance/TeamOverviewGrid";
import {
  Phone, MapPin, CheckCircle2, Target, TrendingUp, FileText,
  Trophy, Users, BarChart3, Activity, AlertTriangle, Clock,
  Gauge, Calendar,
} from "lucide-react";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "all_time", label: "All Time" },
];

const PerformanceMatrix = () => {
  const [period, setPeriod] = useState<PeriodType>("this_month");
  const [activeTab, setActiveTab] = useState("my_performance");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const { user, role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";

  // My own metrics
  const { metrics: myMetrics, loading: myLoading } = usePerformanceMetrics(user?.id || null, period);
  const { targets } = usePerformanceTargets(user?.id || undefined);

  // All staff metrics (admin)
  const { staffMetrics, loading: allLoading } = useAllStaffMetrics(period);

  // Individual staff view (admin)
  const { metrics: individualMetrics, loading: indivLoading } = usePerformanceMetrics(
    selectedStaffId, period
  );
  const selectedStaff = staffMetrics.find(s => s.staffId === selectedStaffId);

  const handleStaffClick = (staffId: string) => {
    setSelectedStaffId(staffId);
    setActiveTab("individual");
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Performance Matrix</h1>
            <p className="text-muted-foreground">Track productivity, conversions, and KPIs</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my_performance">My Performance</TabsTrigger>
            {isAdmin && <TabsTrigger value="team_overview">Team Overview</TabsTrigger>}
            {isAdmin && <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>}
            {isAdmin && <TabsTrigger value="individual">Individual</TabsTrigger>}
          </TabsList>

          {/* MY PERFORMANCE TAB */}
          <TabsContent value="my_performance" className="space-y-6">
            {myLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[1,2,3,4,5,6].map(i => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : myMetrics ? (
              <>
                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <PerformanceWidget
                    title="Activity Score"
                    value={myMetrics.activityScore}
                    type="number"
                    target={targets.activity_score_min || 100}
                    icon={<Gauge className="h-4 w-4" />}
                    subtitle="Composite score"
                  />
                  <PerformanceWidget
                    title="Total Calls"
                    value={myMetrics.totalCalls}
                    icon={<Phone className="h-4 w-4" />}
                    target={targets.calls_per_week}
                    subtitle={`${myMetrics.directCallsMade} direct + ${myMetrics.callTasksCompleted} task`}
                  />
                  <PerformanceWidget
                    title="Site Visits"
                    value={myMetrics.siteVisitsCompleted}
                    icon={<MapPin className="h-4 w-4" />}
                    target={targets.site_visits_per_week}
                  />
                  <PerformanceWidget
                    title="Task Completion"
                    value={myMetrics.taskCompletionRate}
                    type="percentage"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    target={targets.tasks_completion_rate ? targets.tasks_completion_rate : undefined}
                    subtitle={`${myMetrics.tasksCompleted} done, ${myMetrics.tasksPending} pending`}
                  />
                  <PerformanceWidget
                    title="Conversion Rate"
                    value={myMetrics.conversionRate}
                    type="percentage"
                    icon={<TrendingUp className="h-4 w-4" />}
                    target={targets.conversion_rate_min ? targets.conversion_rate_min : undefined}
                    subtitle={`${myMetrics.leadsConverted} / ${myMetrics.leadsAssigned} leads`}
                  />
                  <PerformanceWidget
                    title="Quotations Won"
                    value={myMetrics.quotationsWon}
                    icon={<FileText className="h-4 w-4" />}
                    subtitle={myMetrics.winRate > 0 ? `Win rate: ${myMetrics.winRate}%` : undefined}
                  />
                </div>

                {/* Additional metrics row */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <PerformanceWidget
                    title="Leads Created"
                    value={myMetrics.leadsCreated}
                    icon={<Target className="h-4 w-4" />}
                    size="small"
                  />
                  <PerformanceWidget
                    title="Meetings Held"
                    value={myMetrics.meetingsHeld}
                    icon={<Calendar className="h-4 w-4" />}
                    size="small"
                  />
                  <PerformanceWidget
                    title="Overdue Tasks"
                    value={myMetrics.tasksOverdue}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    size="small"
                    subtitle={myMetrics.tasksOverdue > 0 ? "Needs attention" : "All clear"}
                  />
                  <PerformanceWidget
                    title="Days Active"
                    value={myMetrics.daysActive}
                    icon={<Activity className="h-4 w-4" />}
                    size="small"
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No performance data available</div>
            )}
          </TabsContent>

          {/* TEAM OVERVIEW TAB (Admin) */}
          <TabsContent value="team_overview" className="space-y-6">
            {allLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
              </div>
            ) : (
              <>
                {/* Overview KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <PerformanceWidget
                    title="Total Calls (Team)"
                    value={staffMetrics.reduce((s, m) => s + m.totalCalls, 0)}
                    icon={<Phone className="h-4 w-4" />}
                  />
                  <PerformanceWidget
                    title="Total Visits (Team)"
                    value={staffMetrics.reduce((s, m) => s + m.siteVisitsCompleted, 0)}
                    icon={<MapPin className="h-4 w-4" />}
                  />
                  <PerformanceWidget
                    title="Total Conversions"
                    value={staffMetrics.reduce((s, m) => s + m.leadsConverted, 0)}
                    icon={<TrendingUp className="h-4 w-4" />}
                  />
                  <PerformanceWidget
                    title="Tasks Completed"
                    value={staffMetrics.reduce((s, m) => s + m.tasksCompleted, 0)}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                  <PerformanceWidget
                    title="Revenue Pipeline"
                    value={staffMetrics.reduce((s, m) => s + m.totalRevenuePipeline, 0)}
                    type="currency"
                    icon={<FileText className="h-4 w-4" />}
                  />
                </div>

                <TeamOverviewGrid staffMetrics={staffMetrics} onStaffClick={handleStaffClick} />
              </>
            )}
          </TabsContent>

          {/* LEADERBOARD TAB (Admin) */}
          <TabsContent value="leaderboard" className="space-y-6">
            {allLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : (
              <>
                <LeaderboardCard staffMetrics={staffMetrics} onStaffClick={handleStaffClick} />
                <PerformanceCharts staffMetrics={staffMetrics} />
                <StaffPerformanceTable staffMetrics={staffMetrics} onStaffClick={handleStaffClick} />
              </>
            )}
          </TabsContent>

          {/* INDIVIDUAL TAB (Admin) */}
          <TabsContent value="individual" className="space-y-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-muted-foreground">Viewing:</label>
              <Select
                value={selectedStaffId || ""}
                onValueChange={(v) => setSelectedStaffId(v)}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffMetrics.map(s => (
                    <SelectItem key={s.staffId} value={s.staffId}>{s.staffName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedStaffId ? (
              <div className="text-center py-12 text-muted-foreground">
                Select a staff member to view their performance
              </div>
            ) : indivLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
              </div>
            ) : individualMetrics ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <PerformanceWidget title="Activity Score" value={individualMetrics.activityScore} target={100} icon={<Gauge className="h-4 w-4" />} />
                  <PerformanceWidget title="Total Calls" value={individualMetrics.totalCalls} icon={<Phone className="h-4 w-4" />} subtitle={`${individualMetrics.directCallsMade} direct + ${individualMetrics.callTasksCompleted} task`} />
                  <PerformanceWidget title="Site Visits" value={individualMetrics.siteVisitsCompleted} icon={<MapPin className="h-4 w-4" />} />
                  <PerformanceWidget title="Task Completion" value={individualMetrics.taskCompletionRate} type="percentage" icon={<CheckCircle2 className="h-4 w-4" />} subtitle={`${individualMetrics.tasksCompleted} done`} />
                  <PerformanceWidget title="Conversion Rate" value={individualMetrics.conversionRate} type="percentage" icon={<TrendingUp className="h-4 w-4" />} subtitle={`${individualMetrics.leadsConverted}/${individualMetrics.leadsAssigned}`} />
                  <PerformanceWidget title="Win Rate" value={individualMetrics.winRate} type="percentage" icon={<Trophy className="h-4 w-4" />} subtitle={`${individualMetrics.quotationsWon} won`} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <PerformanceWidget title="Leads Created" value={individualMetrics.leadsCreated} icon={<Target className="h-4 w-4" />} size="small" />
                  <PerformanceWidget title="Quotations Created" value={individualMetrics.quotationsCreated} icon={<FileText className="h-4 w-4" />} size="small" />
                  <PerformanceWidget title="Overdue Tasks" value={individualMetrics.tasksOverdue} icon={<AlertTriangle className="h-4 w-4" />} size="small" />
                  <PerformanceWidget title="Revenue Pipeline" value={individualMetrics.totalRevenuePipeline} type="currency" icon={<FileText className="h-4 w-4" />} size="small" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <PerformanceWidget title="Follow-ups Done" value={individualMetrics.followUpsCompleted} size="small" />
                  <PerformanceWidget title="Meetings Held" value={individualMetrics.meetingsHeld} icon={<Calendar className="h-4 w-4" />} size="small" />
                  <PerformanceWidget title="Login Count" value={individualMetrics.loginCount} size="small" />
                  <PerformanceWidget title="Days Active" value={individualMetrics.daysActive} icon={<Activity className="h-4 w-4" />} size="small" />
                </div>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PerformanceMatrix;
