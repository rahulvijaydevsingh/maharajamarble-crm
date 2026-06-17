import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffMetrics } from "@/hooks/usePerformanceMetrics";
import { AlertTriangle, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  field_agent: "Field Agent",
  sales_viewer: "Viewer",
};

interface StaffPerformanceTableProps {
  staffMetrics: StaffMetrics[];
  onStaffClick?: (staffId: string) => void;
}

export function StaffPerformanceTable({ staffMetrics, onStaffClick }: StaffPerformanceTableProps) {
  const getScoreBadge = (score: number) => {
    if (score >= 70) return "default";
    if (score >= 40) return "secondary";
    return "destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Detailed Staff Performance
        </CardTitle>
        <CardDescription>Complete breakdown of each staff member's KPIs</CardDescription>
      </CardHeader>
      <CardContent>
        {staffMetrics.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No staff data available</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Calls</TableHead>
                  <TableHead className="text-center">Visits</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Conv.</TableHead>
                  <TableHead className="text-center">Conv.%</TableHead>
                  <TableHead className="text-center">Quotes</TableHead>
                  <TableHead className="text-center">Won</TableHead>
                  <TableHead className="text-center">Win%</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead className="text-center">Overdue</TableHead>
                  <TableHead className="text-center">Comp.%</TableHead>
                  <TableHead className="text-center">Avg Hrs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffMetrics.map((staff, i) => (
                  <TableRow
                    key={staff.staffId}
                    className={cn(
                      "cursor-pointer hover:bg-accent/50",
                      i < 3 && "border-l-2",
                      i === 0 && "border-l-yellow-500",
                      i === 1 && "border-l-gray-400",
                      i === 2 && "border-l-amber-700",
                      staffMetrics.length > 5 && i >= staffMetrics.length - 3 && staff.activityScore < 40 && "bg-red-50/50 dark:bg-red-950/10"
                    )}
                    onClick={() => onStaffClick?.(staff.staffId)}
                  >
                    <TableCell className="font-medium sticky left-0 bg-background z-10">{staff.staffName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ROLE_LABELS[staff.role || ""] || staff.role || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getScoreBadge(staff.activityScore)} className="text-xs">
                        {staff.activityScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{staff.totalCalls}</TableCell>
                    <TableCell className="text-center">{staff.siteVisitsCompleted}</TableCell>
                    <TableCell className="text-center">{staff.leadsAssigned}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 font-medium">{staff.leadsConverted}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={staff.conversionRate >= 30 ? "default" : staff.conversionRate > 0 ? "secondary" : "outline"} className="text-xs">
                        {staff.conversionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{staff.quotationsCreated}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 font-medium">{staff.quotationsWon}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {staff.winRate > 0 ? `${staff.winRate}%` : "—"}
                    </TableCell>
                    <TableCell className="text-center font-medium">{staff.tasksCompleted}</TableCell>
                    <TableCell className="text-center">
                      {staff.tasksOverdue > 0 ? (
                        <span className="flex items-center justify-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {staff.tasksOverdue}
                        </span>
                      ) : "0"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={staff.taskCompletionRate >= 80 ? "default" : staff.taskCompletionRate >= 50 ? "secondary" : "destructive"} className="text-xs">
                        {staff.taskCompletionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {staff.avgTaskCompletionHours !== null ? (
                        <span className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {staff.avgTaskCompletionHours}h
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
