import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import { StaffMetrics } from "@/hooks/usePerformanceMetrics";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const COMPARE_METRICS = [
  { key: "totalCalls", label: "Total Calls" },
  { key: "siteVisitsCompleted", label: "Site Visits" },
  { key: "tasksCompleted", label: "Tasks Completed" },
  { key: "leadsConverted", label: "Leads Converted" },
  { key: "conversionRate", label: "Conversion Rate %" },
  { key: "quotationsCreated", label: "Quotations Created" },
  { key: "quotationsWon", label: "Quotations Won" },
  { key: "winRate", label: "Win Rate %" },
  { key: "taskCompletionRate", label: "Task Completion %" },
  { key: "activityScore", label: "Activity Score" },
  { key: "meetingsHeld", label: "Meetings Held" },
  { key: "followUpsCompleted", label: "Follow-ups Done" },
];

const RADAR_METRICS = [
  { key: "totalCalls", label: "Calls" },
  { key: "siteVisitsCompleted", label: "Visits" },
  { key: "leadsConverted", label: "Conversions" },
  { key: "conversionRate", label: "Conv. Rate" },
  { key: "quotationsCreated", label: "Quotations" },
  { key: "tasksCompleted", label: "Tasks" },
];

const STAFF_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(0 84% 60%)",
];

interface ComparisonViewProps {
  staffMetrics: StaffMetrics[];
  targets?: Record<string, number>;
}

export function ComparisonView({ staffMetrics, targets = {} }: ComparisonViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("totalCalls");

  const selectedStaff = useMemo(() =>
    selectedIds.map(id => staffMetrics.find(s => s.staffId === id)).filter(Boolean) as StaffMetrics[],
    [selectedIds, staffMetrics]
  );

  const addStaff = (id: string) => {
    if (selectedIds.length < 5 && !selectedIds.includes(id)) {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const removeStaff = (id: string) => {
    setSelectedIds(prev => prev.filter(x => x !== id));
  };

  const metricLabel = COMPARE_METRICS.find(m => m.key === selectedMetric)?.label || selectedMetric;
  const targetValue = targets[selectedMetric];

  // Bar chart data
  const barData = selectedStaff.map(s => ({
    name: s.staffName.split(" ")[0],
    value: (s as any)[selectedMetric] || 0,
  }));

  // Radar chart data
  const radarData = useMemo(() => {
    if (selectedStaff.length === 0) return [];
    // Normalize each metric to 0-100 scale based on max among selected
    return RADAR_METRICS.map(m => {
      const values = selectedStaff.map(s => (s as any)[m.key] || 0);
      const max = Math.max(...values, 1);
      const entry: any = { metric: m.label, fullMark: 100 };
      selectedStaff.forEach((s, i) => {
        entry[s.staffName] = Math.round(((s as any)[m.key] || 0) / max * 100);
      });
      return entry;
    });
  }, [selectedStaff]);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      {/* Staff Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Staff (2-5)</CardTitle>
          <CardDescription>Select staff members to compare side by side</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            {selectedStaff.map((s, i) => (
              <Badge key={s.staffId} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAFF_COLORS[i] }} />
                {s.staffName}
                <X className="h-3 w-3 cursor-pointer ml-1" onClick={() => removeStaff(s.staffId)} />
              </Badge>
            ))}
            {selectedIds.length < 5 && (
              <Select onValueChange={addStaff} value="">
                <SelectTrigger className="w-[200px] h-8">
                  <SelectValue placeholder="+ Add staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffMetrics.filter(s => !selectedIds.includes(s.staffId)).map(s => (
                    <SelectItem key={s.staffId} value={s.staffId}>{s.staffName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Metric selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Compare metric:</span>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPARE_METRICS.map(m => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedStaff.length >= 2 && (
        <>
          {/* Bar Chart Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>{metricLabel} Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip contentStyle={tooltipStyle} />
                    {targetValue && (
                      <ReferenceLine y={targetValue} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `Target: ${targetValue}`, fill: "hsl(var(--destructive))", fontSize: 11 }} />
                    )}
                    <Bar dataKey="value" name={metricLabel} radius={[6, 6, 0, 0]}>
                      {barData.map((_, i) => (
                        <rect key={i} fill={STAFF_COLORS[i % STAFF_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Mini table */}
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">{metricLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedStaff.map((s, i) => (
                    <TableRow key={s.staffId}>
                      <TableCell className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: STAFF_COLORS[i] }} />
                        {s.staffName}
                      </TableCell>
                      <TableCell className="text-right font-medium">{(s as any)[selectedMetric] || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Radar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Multi-Metric Radar</CardTitle>
              <CardDescription>All 6 core metrics normalized — relative strengths and weaknesses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid className="stroke-border/50" />
                    <PolarAngleAxis dataKey="metric" className="text-xs fill-muted-foreground" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs fill-muted-foreground" />
                    {selectedStaff.map((s, i) => (
                      <Radar
                        key={s.staffId}
                        name={s.staffName}
                        dataKey={s.staffName}
                        stroke={STAFF_COLORS[i]}
                        fill={STAFF_COLORS[i]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedStaff.length < 2 && (
        <div className="text-center py-12 text-muted-foreground">
          Select at least 2 staff members to compare
        </div>
      )}
    </div>
  );
}
