import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { StaffMetrics } from "@/hooks/usePerformanceMetrics";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
  "hsl(25 95% 53%)",
  "hsl(var(--accent))",
];

interface PerformanceChartsProps {
  staffMetrics: StaffMetrics[];
}

export function PerformanceCharts({ staffMetrics }: PerformanceChartsProps) {
  const activeStaff = staffMetrics.filter(s => s.totalActivities > 0 || s.activityScore > 0);

  if (activeStaff.length === 0) return null;

  const barData = activeStaff.slice(0, 8).map(s => ({
    name: s.staffName.split(" ")[0],
    Calls: s.totalCalls,
    Visits: s.siteVisitsCompleted,
    Tasks: s.tasksCompleted,
    Conv: s.leadsConverted,
  }));

  const totals = staffMetrics.reduce((acc, s) => ({
    calls: acc.calls + s.totalCalls,
    visits: acc.visits + s.siteVisitsCompleted,
    tasks: acc.tasks + s.tasksCompleted,
    conversions: acc.conversions + s.leadsConverted,
    quotations: acc.quotations + s.quotationsCreated,
  }), { calls: 0, visits: 0, tasks: 0, conversions: 0, quotations: 0 });

  const pieData = [
    { name: "Calls", value: totals.calls },
    { name: "Site Visits", value: totals.visits },
    { name: "Tasks Done", value: totals.tasks },
    { name: "Conversions", value: totals.conversions },
    { name: "Quotations", value: totals.quotations },
  ].filter(d => d.value > 0);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Staff Comparison</CardTitle>
          <CardDescription>Calls, visits, tasks & conversions per staff</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="Calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Visits" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tasks" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Conv" fill="hsl(262 83% 58%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Breakdown</CardTitle>
          <CardDescription>Team output distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ value }) => `${value}`}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" height={36} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
