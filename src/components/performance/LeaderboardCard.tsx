import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award } from "lucide-react";
import { StaffMetrics } from "@/hooks/usePerformanceMetrics";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  field_agent: "Field Agent",
  sales_viewer: "Viewer",
};

interface LeaderboardCardProps {
  staffMetrics: StaffMetrics[];
  onStaffClick?: (staffId: string) => void;
}

export function LeaderboardCard({ staffMetrics, onStaffClick }: LeaderboardCardProps) {
  const leaderboard = staffMetrics.filter(s => s.totalActivities > 0 || s.activityScore > 0);

  const getMedalIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Award className="h-5 w-5 text-amber-700" />;
    return <span className="h-5 w-5 flex items-center justify-center text-xs text-muted-foreground font-bold">{index + 1}</span>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-green-500/10 text-green-700 border-green-500/30";
    if (score >= 40) return "bg-yellow-500/10 text-yellow-700 border-yellow-500/30";
    return "bg-red-500/10 text-red-700 border-red-500/30";
  };

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">No activity data yet</div>
        </CardContent>
      </Card>
    );
  }

  const maxScore = leaderboard[0]?.activityScore || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
        <CardDescription>Ranked by activity score</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {leaderboard.slice(0, 6).map((staff, i) => (
            <div
              key={staff.staffId}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors",
                i < 3 && "border-l-4",
                i === 0 && "border-l-yellow-500",
                i === 1 && "border-l-gray-400",
                i === 2 && "border-l-amber-700",
              )}
              onClick={() => onStaffClick?.(staff.staffId)}
            >
              <div className="flex-shrink-0">{getMedalIcon(i)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{staff.staffName}</div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABELS[staff.role || ""] || staff.role || "—"}
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground">📞{staff.totalCalls}</span>
                  <span className="text-[10px] text-muted-foreground">🏠{staff.siteVisitsCompleted}</span>
                  <span className="text-[10px] text-muted-foreground">✅{staff.tasksCompleted}</span>
                </div>
                <Progress value={(staff.activityScore / Math.max(maxScore, 1)) * 100} className="h-1.5 mt-1" />
              </div>
              <div className="text-right flex-shrink-0">
                <Badge variant="outline" className={cn("text-xs", getScoreColor(staff.activityScore))}>
                  {staff.activityScore}
                </Badge>
                <div className="text-[10px] text-muted-foreground mt-0.5">score</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
