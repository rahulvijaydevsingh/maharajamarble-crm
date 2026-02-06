import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeartHandshake, AlertCircle, Clock, CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { useKitDashboard } from "@/hooks/useKitDashboard";
import { useKitTouches } from "@/hooks/useKitTouches";
import { useAuth } from "@/contexts/AuthContext";
import { KIT_TOUCH_METHOD_ICONS, KIT_TOUCH_METHOD_COLORS, KitTouchMethod } from "@/constants/kitConstants";
import { format, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";
import { KitTouchCompleteDialog } from "@/components/kit/KitTouchCompleteDialog";
import { useNavigate } from "react-router-dom";

export function KitDashboardWidget() {
  const { user } = useAuth();
  const { data, loading, refetch } = useKitDashboard(user?.id);
  const { completeTouch, snoozeTouch, rescheduleTouch } = useKitTouches();
  const navigate = useNavigate();
  
  const [selectedTouch, setSelectedTouch] = useState<any>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTouchClick = (touch: any) => {
    // Navigate to entity profile with KIT tab
    const entityType = touch.subscription.entity_type;
    const entityId = touch.subscription.entity_id;
    
    if (entityType === 'lead') {
      navigate(`/leads?view=${entityId}&tab=kit`);
    } else if (entityType === 'customer') {
      navigate(`/customers?view=${entityId}&tab=kit`);
    } else if (entityType === 'professional') {
      navigate(`/professionals?view=${entityId}&tab=kit`);
    }
  };

  const handleLogTouch = (touch: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTouch(touch);
    setCompleteDialogOpen(true);
  };

  const handleComplete = async (outcome: string, notes?: string) => {
    if (!selectedTouch) return;
    setIsProcessing(true);
    try {
      await completeTouch({ touchId: selectedTouch.id, outcome, outcomeNotes: notes });
      refetch();
    } finally {
      setIsProcessing(false);
      setCompleteDialogOpen(false);
      setSelectedTouch(null);
    }
  };

  const handleSnooze = async (snoozeUntil: string) => {
    if (!selectedTouch) return;
    setIsProcessing(true);
    try {
      await snoozeTouch({ touchId: selectedTouch.id, snoozeUntil });
      refetch();
    } finally {
      setIsProcessing(false);
      setCompleteDialogOpen(false);
      setSelectedTouch(null);
    }
  };

  const handleReschedule = async (newDate: string) => {
    if (!selectedTouch) return;
    setIsProcessing(true);
    try {
      await rescheduleTouch({ touchId: selectedTouch.id, newDate });
      refetch();
    } finally {
      setIsProcessing(false);
      setCompleteDialogOpen(false);
      setSelectedTouch(null);
    }
  };

  const formatScheduledDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "MMM d");
  };

  const renderTouchItem = (touch: any) => {
    const MethodIcon = KIT_TOUCH_METHOD_ICONS[touch.method as KitTouchMethod];
    const methodColor = KIT_TOUCH_METHOD_COLORS[touch.method as KitTouchMethod];
    
    return (
      <div
        key={touch.id}
        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
        onClick={() => handleTouchClick(touch)}
      >
        <div className={cn("p-2 rounded-md", methodColor)}>
          <MethodIcon className="h-4 w-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {touch.subscription.entity_name || "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {touch.method} • {touch.subscription.preset?.name || "Custom"}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatScheduledDate(touch.scheduled_date)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => handleLogTouch(touch, e)}
          >
            Log
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="marble-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" />
            Keep in Touch
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasAnyTouches = data && (data.overdueCount > 0 || data.todayCount > 0 || data.upcomingCount > 0);

  return (
    <>
      <Card className="marble-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HeartHandshake className="h-5 w-5" />
              Keep in Touch
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs"
              onClick={() => navigate('/calendar?filter=kit')}
            >
              View All
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <CardDescription className="flex items-center gap-3 mt-1">
            {data?.overdueCount ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {data.overdueCount} overdue
              </span>
            ) : null}
            {data?.todayCount ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {data.todayCount} due today
              </span>
            ) : null}
            {data?.upcomingCount ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {data.upcomingCount} upcoming
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {!hasAnyTouches ? (
            <div className="text-center py-6 text-muted-foreground">
              <HeartHandshake className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No scheduled touches</p>
              <p className="text-xs">Activate KIT on leads, customers, or professionals</p>
            </div>
          ) : (
            <Tabs defaultValue={data?.overdueCount ? "overdue" : "today"} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="overdue" className="text-xs relative">
                  Overdue
                  {data?.overdueCount ? (
                    <Badge 
                      variant="destructive" 
                      className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
                    >
                      {data.overdueCount}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="today" className="text-xs">
                  Today
                  {data?.todayCount ? (
                    <Badge 
                      variant="secondary" 
                      className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
                    >
                      {data.todayCount}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="text-xs">
                  Upcoming
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="overdue" className="mt-3">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {data?.overdue.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-4">
                        No overdue touches 🎉
                      </p>
                    ) : (
                      data?.overdue.map(renderTouchItem)
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="today" className="mt-3">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {data?.dueNow.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-4">
                        Nothing due today
                      </p>
                    ) : (
                      data?.dueNow.map(renderTouchItem)
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="upcoming" className="mt-3">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {data?.upcoming.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-4">
                        No upcoming touches
                      </p>
                    ) : (
                      data?.upcoming.map(renderTouchItem)
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {selectedTouch && (
        <KitTouchCompleteDialog
          open={completeDialogOpen}
          onOpenChange={(open) => {
            setCompleteDialogOpen(open);
            if (!open) {
              setSelectedTouch(null);
            }
          }}
          touch={selectedTouch}
          entityName={selectedTouch.subscription?.entity_name || "Unknown"}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
          onReschedule={handleReschedule}
          isLoading={isProcessing}
        />
      )}
    </>
  );
}
