import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PerformanceWidgetProps {
  title: string;
  value: number | string;
  subtitle?: string;
  target?: number;
  icon?: React.ReactNode;
  trend?: number; // % change
  type?: "number" | "percentage" | "currency" | "progress";
  size?: "small" | "medium";
  className?: string;
}

export function PerformanceWidget({
  title,
  value,
  subtitle,
  target,
  icon,
  trend,
  type = "number",
  size = "medium",
  className,
}: PerformanceWidgetProps) {
  const numValue = typeof value === "number" ? value : parseFloat(value) || 0;
  const progressPercent = target && target > 0 ? Math.min((numValue / target) * 100, 100) : null;
  const isAboveTarget = target !== undefined && numValue >= target;

  const formatValue = () => {
    if (type === "percentage") return `${value}%`;
    if (type === "currency") return `₹${Number(value).toLocaleString("en-IN")}`;
    return String(value);
  };

  return (
    <Card className={cn("transition-all hover:shadow-md", className)}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className={cn("font-bold", size === "small" ? "text-xl" : "text-2xl")}>
            {formatValue()}
          </div>
          {trend !== undefined && trend !== 0 && (
            <div className={cn(
              "flex items-center text-xs font-medium mb-1",
              trend > 0 ? "text-green-600" : "text-destructive"
            )}>
              {trend > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
              {Math.abs(trend)}%
            </div>
          )}
          {trend === 0 && (
            <div className="flex items-center text-xs text-muted-foreground mb-1">
              <Minus className="h-3 w-3 mr-0.5" /> No change
            </div>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {progressPercent !== null && (
          <div className="mt-2 space-y-1">
            <Progress
              value={progressPercent}
              className={cn("h-2", isAboveTarget ? "[&>div]:bg-green-500" : "[&>div]:bg-primary")}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{numValue} / {target}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
