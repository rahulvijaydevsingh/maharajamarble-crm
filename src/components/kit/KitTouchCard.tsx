 import React from 'react';
 import { Card, CardContent } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { format, parseISO, isPast, isToday } from 'date-fns';
 import { Check, Clock, CalendarDays, SkipForward } from 'lucide-react';
 import type { KitTouch } from '@/constants/kitConstants';
 import {
   KIT_TOUCH_METHOD_ICONS,
   KIT_TOUCH_METHOD_COLORS,
   KIT_TOUCH_STATUS_COLORS,
   KIT_TOUCH_STATUS_LABELS,
 } from '@/constants/kitConstants';
 
 interface KitTouchCardProps {
   touch: KitTouch;
   onComplete: () => void;
   onSnooze: () => void;
   onReschedule: () => void;
   onSkip?: () => void;
   isUpcoming?: boolean;
   disabled?: boolean;
 }
 
 export function KitTouchCard({
   touch,
   onComplete,
   onSnooze,
   onReschedule,
   onSkip,
   isUpcoming = false,
   disabled = false,
 }: KitTouchCardProps) {
   const Icon = KIT_TOUCH_METHOD_ICONS[touch.method];
   const methodColor = KIT_TOUCH_METHOD_COLORS[touch.method];
   const statusColor = KIT_TOUCH_STATUS_COLORS[touch.status];
   const statusLabel = KIT_TOUCH_STATUS_LABELS[touch.status];
   
   const scheduledDate = parseISO(touch.scheduled_date);
   const isOverdue = isPast(scheduledDate) && !isToday(scheduledDate) && touch.status === 'pending';
   const isDueToday = isToday(scheduledDate) && touch.status === 'pending';
   
   return (
     <Card className={`${isOverdue ? 'border-destructive/50 bg-destructive/5' : ''}`}>
       <CardContent className="p-4">
         <div className="flex items-start justify-between gap-4">
           <div className="flex items-start gap-3">
             <div className={`p-2 rounded-lg ${methodColor}`}>
               <Icon className="h-5 w-5" />
             </div>
             <div className="space-y-1">
               <div className="flex items-center gap-2">
                 <span className="font-medium capitalize">{touch.method}</span>
                 {touch.status !== 'pending' && (
                   <Badge variant="secondary" className={`text-xs ${statusColor}`}>
                     {statusLabel}
                   </Badge>
                 )}
                 {isOverdue && (
                   <Badge variant="destructive" className="text-xs">
                     Overdue
                   </Badge>
                 )}
                 {isDueToday && (
                   <Badge className="text-xs bg-primary/10 text-primary">
                     Due Today
                   </Badge>
                 )}
               </div>
               <div className="text-sm text-muted-foreground">
                 {format(scheduledDate, 'MMM d, yyyy')}
                 {touch.scheduled_time && ` at ${touch.scheduled_time}`}
               </div>
               {touch.outcome && (
                 <div className="text-sm">
                   <span className="text-muted-foreground">Outcome:</span>{' '}
                   <span className="font-medium">{touch.outcome}</span>
                 </div>
               )}
               {touch.outcome_notes && (
                 <p className="text-sm text-muted-foreground mt-1">
                   {touch.outcome_notes}
                 </p>
               )}
             </div>
           </div>
           
           {touch.status === 'pending' && !isUpcoming && (
             <div className="flex items-center gap-2 flex-shrink-0">
               <Button
                 size="sm"
                 onClick={onComplete}
                 disabled={disabled}
                 className="gap-1"
               >
                 <Check className="h-4 w-4" />
                 Log
               </Button>
               <Button
                 size="sm"
                 variant="outline"
                 onClick={onSnooze}
                 disabled={disabled}
               >
                 <Clock className="h-4 w-4" />
               </Button>
               <Button
                 size="sm"
                 variant="outline"
                 onClick={onReschedule}
                 disabled={disabled}
               >
                 <CalendarDays className="h-4 w-4" />
               </Button>
               {onSkip && (
                 <Button
                   size="sm"
                   variant="ghost"
                   onClick={onSkip}
                   disabled={disabled}
                 >
                   <SkipForward className="h-4 w-4" />
                 </Button>
               )}
             </div>
           )}
         </div>
       </CardContent>
     </Card>
   );
 }