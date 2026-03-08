import { StaffMetrics } from "@/hooks/usePerformanceMetrics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  field_agent: "Field Agent",
  sales_viewer: "Viewer",
};

interface TeamOverviewGridProps {
  staffMetrics: StaffMetrics[];
  onStaffClick?: (staffId: string) => void;
}

export function TeamOverviewGrid({ staffMetrics, onStaffClick }: TeamOverviewGridProps) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return { bg: "bg-green-500/10 border-green-500/30", text: "text-green-700", label: "High" };
    if (score >= 40) return { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-700", label: "Medium" };
    return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-700", label: "Low" };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Overview</CardTitle>
        <CardDescription>Activity scores for all active staff — click a card for details</CardDescription>
      </CardHeader>
      <CardContent>
        {staffMetrics.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No active staff</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {staffMetrics.map((staff) => {
              const sc = getScoreColor(staff.activityScore);
              return (
                <div
                  key={staff.staffId}
                  className={cn(
                    "p-4 rounded-lg border cursor-pointer hover:shadow-md transition-all",
                    sc.bg
                  )}
                  onClick={() => onStaffClick?.(staff.staffId)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold truncate">{staff.staffName}</div>
                      <div className="text-xs text-muted-foreground">
                        {ROLE_LABELS[staff.role || ""] || staff.role || "—"}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-lg font-bold", sc.text, sc.bg)}>
                      {staff.activityScore}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div>
                      <div className="text-sm font-semibold">{staff.totalCalls}</div>
                      <div className="text-[10px] text-muted-foreground">Calls</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{staff.siteVisitsCompleted}</div>
                      <div className="text-[10px] text-muted-foreground">Visits</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{staff.conversionRate}%</div>
                      <div className="text-[10px] text-muted-foreground">Conv.</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
