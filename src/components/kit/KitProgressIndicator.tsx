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
   
   const progressPercent = totalSteps > 0 ? ((currentStep) / totalSteps) * 100 : 0;
   
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