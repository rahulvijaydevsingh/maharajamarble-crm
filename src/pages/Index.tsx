import { BarChart, Calendar, Phone, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { RemindersWidget } from "@/components/dashboard/RemindersWidget";
import { TaskList } from "@/components/tasks/TaskList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";

const Index = () => {
  const { stats, loading } = useDashboardStats();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-marble-primary mb-1">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's an overview of your CRM data.
          </p>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="marble-card">
                  <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                  <CardContent><Skeleton className="h-8 w-16" /></CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <StatCard 
                title="Total Leads" 
                value={stats.totalLeads.toString()} 
                description={`${stats.leadsThisMonth} this month`}
                trend={stats.leadsTrend !== 0 ? { value: Math.abs(stats.leadsTrend), isPositive: stats.leadsTrend > 0 } : undefined}
                icon={Phone}
              />
              <StatCard 
                title="Conversion Rate" 
                value={`${stats.conversionRate}%`} 
                description="Leads converted" 
                icon={TrendingUp}
              />
              <StatCard 
                title="Pending Tasks" 
                value={stats.pendingTasks.toString()} 
                description={stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : "Due this week"}
                icon={stats.overdueTasks > 0 ? AlertTriangle : Calendar}
              />
              <StatCard 
                title="Active Customers" 
                value={stats.activeCustomers.toString()} 
                description="Total active"
                trend={stats.customersTrend !== 0 ? { value: Math.abs(stats.customersTrend), isPositive: stats.customersTrend > 0 } : undefined}
                icon={Users}
              />
            </>
          )}
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="marble-card">
            <CardHeader>
              <CardTitle>Lead Sources</CardTitle>
              <CardDescription>Distribution of leads by source</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[200px] flex items-center justify-center">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : stats.leadSources.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No lead data available
                </div>
              ) : (
                <div className="h-[200px] flex items-center">
                  <div className="w-full flex items-end justify-around h-[180px] gap-1">
                    {stats.leadSources.map((item) => (
                      <div key={item.name} className="flex flex-col items-center">
                        <div 
                          className="bg-marble-primary rounded-t-sm w-12"
                          style={{ 
                            height: `${Math.max(item.value * 1.5, 10)}px`,
                            background: `linear-gradient(to top, hsl(var(--primary)), hsl(var(--primary) / 0.7))`
                          }}
                        ></div>
                        <div className="text-xs mt-2 text-center max-w-[60px] truncate">{item.name}</div>
                        <div className="text-xs font-medium">{item.value}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <RemindersWidget />
        </div>
        
        <div className="grid gap-4 md:grid-cols-1">
          <TaskList />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
