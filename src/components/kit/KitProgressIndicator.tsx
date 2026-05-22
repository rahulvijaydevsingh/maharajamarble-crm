 import React from 'react';
 import { Progress } from '@/components/ui/progress';
 import { Badge } from '@/components/ui/badge';
 import type { KitSubscription } from '@/constants/kitConstants';
 
 interface KitProgressIndicatorProps {
   subscription: KitSubscription;
   totalSteps: number;
 }
 
export function KitProgressIndicator({ subscription, totalSteps }: KitProgressIndicatorProps) {
  const currentStep = subscription.current_step || 0;
  const cycleCount = subscription.cycle_count || 1;
  const maxCycles = subscription.max_cycles;

  // current_step is 0-indexed (raw DB value); label shows currentStep + 1 as 1-indexed.
  // Align bar with label: "Step 1 of 4" => 1/4 = 25%. Clamp to [0, 100].
  const safeTotal = Math.max(Number(totalSteps) || 0, 0);
  const safeCurrent = Math.min(Math.max(currentStep, 0), safeTotal);
  const progressPercent = safeTotal > 0
    ? Math.min(((safeCurrent + 1) / safeTotal) * 100, 100)
    : 0;
   
   return (
     <div className="space-y-2">
       <div className="flex items-center justify-between text-sm">
         <span className="text-muted-foreground">
           Step {currentStep + 1} of {totalSteps}
         </span>
         <Badge variant="outline" className="text-xs">
           Cycle {cycleCount}{maxCycles ? ` of ${maxCycles}` : ''}
         </Badge>
       </div>
       <Progress value={progressPercent} className="h-2" />
     </div>
   );
 }