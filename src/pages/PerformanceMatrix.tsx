import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { usePerformanceStats, StaffPerformance } from "@/hooks/usePerformanceStats";
import { Trophy, TrendingUp, Users, Target, CheckCircle2, FileText, AlertTriangle, Clock, Award, Medal } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  field_agent: "Field Agent",
  sales_viewer: "Viewer",
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
  "hsl(25 95% 53%)",
];

type Period = "this_month" | "last_month" | "last_3_months" | "all_time";

const PerformanceMatrix = () => {
  const [period, setPeriod] = useState<Period>("this_month");
  const { staffStats, overview, loading } = usePerformanceStats(period);

  const leaderboard = [...staffStats]
    .filter(s => s.totalActivities > 0)
    .sort((a, b) => b.totalActivities - a.totalActivities);

  const barData = staffStats
    .filter(s => s.totalActivities > 0)
    .map(s => ({
      name: s.staffName.split(" ")[0],
      Leads: s.leadsCreated,
      Tasks: s.tasksCompleted,
      Conversions: s.leadsConverted,
    }));

  const pieData = [
    { name: "Leads Created", value: overview.totalLeadsCreated },
    { name: "Tasks Completed", value: overview.totalTasksCompleted },
    { name: "Conversions", value: overview.totalLeadsConverted },
    { name: "Quotations", value: overview.totalQuotations },
  ].filter(d => d.value > 0);

  const getMedalIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Award className="h-5 w-5 text-amber-700" />;
    return <span className="h-5 w-5 flex items-center justify-center text-xs text-muted-foreground font-bold">{index + 1}</span>;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Performance Matrix</h1>
            <p className="text-muted-foreground">Track staff productivity, conversions, and KPIs</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Overview Cards */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Leads Created</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{overview.totalLeadsCreated}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Conversions</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{overview.totalLeadsConverted}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{overview.avgConversionRate}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tasks Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{overview.totalTasksCompleted}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Quotations</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{overview.totalQuotations}</div></CardContent>
            </Card>
          </div>
        )}

        {/* Charts Row */}
        {!loading && barData.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Staff Comparison</CardTitle>
                <CardDescription>Leads, tasks completed & conversions per staff</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Tasks" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Conversions" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity Breakdown</CardTitle>
                <CardDescription>Overall team output</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, value }) => `${value}`}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" height={36} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Leaderboard */}
        {!loading && leaderboard.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Leaderboard
              </CardTitle>
              <CardDescription>Ranked by total activity (leads + tasks + conversions + quotations)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {leaderboard.slice(0, 6).map((staff, i) => {
                  const maxActivity = leaderboard[0]?.totalActivities || 1;
                  return (
                    <div key={staff.staffId} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex-shrink-0">{getMedalIcon(i)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{staff.staffName}</div>
                        <div className="text-xs text-muted-foreground">
                          {ROLE_LABELS[staff.role || ""] || staff.role || "—"}
                        </div>
                        <Progress value={(staff.totalActivities / maxActivity) * 100} className="h-1.5 mt-1" />
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold">{staff.totalActivities}</div>
                        <div className="text-xs text-muted-foreground">activities</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Detailed Staff Performance
            </CardTitle>
            <CardDescription>Complete breakdown of each staff member's KPIs</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : staffStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No staff data available</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-center">Leads</TableHead>
                      <TableHead className="text-center">Converted</TableHead>
                      <TableHead className="text-center">Conv. %</TableHead>
                      <TableHead className="text-center">Lost</TableHead>
                      <TableHead className="text-center">Tasks Done</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Avg Hours</TableHead>
                      <TableHead className="text-center">Customers</TableHead>
                      <TableHead className="text-center">Quotes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffStats.map((staff) => (
                      <TableRow key={staff.staffId}>
                        <TableCell className="font-medium">{staff.staffName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {ROLE_LABELS[staff.role || ""] || staff.role || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{staff.leadsCreated}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600 font-medium">{staff.leadsConverted}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={staff.conversionRate >= 30 ? "default" : staff.conversionRate > 0 ? "secondary" : "outline"} className="text-xs">
                            {staff.conversionRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.leadsLost > 0 ? <span className="text-destructive">{staff.leadsLost}</span> : "0"}
                        </TableCell>
                        <TableCell className="text-center font-medium">{staff.tasksCompleted}</TableCell>
                        <TableCell className="text-center">
                          {staff.tasksOverdue > 0 ? (
                            <span className="flex items-center justify-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" /> {staff.tasksOverdue}
                            </span>
                          ) : "0"}
                        </TableCell>
                        <TableCell className="text-center">{staff.tasksPending}</TableCell>
                        <TableCell className="text-center">
                          {staff.avgTaskCompletionHours !== null ? (
                            <span className="flex items-center justify-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" /> {staff.avgTaskCompletionHours}h
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center">{staff.customersCreated}</TableCell>
                        <TableCell className="text-center">{staff.quotationsCreated}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PerformanceMatrix;
