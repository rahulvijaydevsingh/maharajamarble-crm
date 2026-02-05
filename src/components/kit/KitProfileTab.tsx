 import React, { useState } from 'react';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Separator } from '@/components/ui/separator';
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from '@/components/ui/alert-dialog';
 import { HeartHandshake, Pause, Play, X, Calendar, Loader2 } from 'lucide-react';
 import { format, parseISO } from 'date-fns';
 import { useKitSubscriptions } from '@/hooks/useKitSubscriptions';
 import { useKitTouches } from '@/hooks/useKitTouches';
 import { KitActivationDialog } from './KitActivationDialog';
 import { KitTouchCard } from './KitTouchCard';
 import { KitTouchCompleteDialog } from './KitTouchCompleteDialog';
 import { KitPauseDialog } from './KitPauseDialog';
 import { KitProgressIndicator } from './KitProgressIndicator';
 import type { KitEntityType, KitTouch } from '@/constants/kitConstants';
 import {
   KIT_SUBSCRIPTION_STATUS_COLORS,
   KIT_SUBSCRIPTION_STATUS_LABELS,
 } from '@/constants/kitConstants';
 
 interface KitProfileTabProps {
   entityType: KitEntityType;
   entityId: string;
   entityName: string;
   defaultAssignee: string;
 }
 
 export function KitProfileTab({
   entityType,
   entityId,
   entityName,
   defaultAssignee,
 }: KitProfileTabProps) {
   const [activationOpen, setActivationOpen] = useState(false);
   const [pauseOpen, setPauseOpen] = useState(false);
   const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
   const [completeDialogTouch, setCompleteDialogTouch] = useState<KitTouch | null>(null);
   
   const {
     subscription,
     loading: subLoading,
     activateKit,
     pauseSubscription,
     resumeSubscription,
     cancelSubscription,
     isActivating,
     isPausing,
     isResuming,
     isCancelling,
   } = useKitSubscriptions(entityType, entityId);
   
   const {
     touches,
     nextTouch,
     completedTouches,
     remainingTouches,
     loading: touchesLoading,
     completeTouch,
     snoozeTouch,
     rescheduleTouch,
     skipTouch,
     isCompleting,
     isSnoozing,
     isRescheduling,
   } = useKitTouches(subscription?.id);
   
   const handleActivate = async (presetId: string, assignedTo: string, maxCycles?: number) => {
     await activateKit({ entityType, entityId, presetId, assignedTo, maxCycles });
   };
   
   const handlePause = async (pauseUntil?: string, pauseReason?: string) => {
     if (!subscription) return;
     await pauseSubscription({ subscriptionId: subscription.id, pauseUntil, pauseReason });
   };
   
   const handleResume = async () => {
     if (!subscription) return;
     await resumeSubscription(subscription.id);
   };
   
   const handleCancel = async () => {
     if (!subscription) return;
     await cancelSubscription(subscription.id);
     setCancelConfirmOpen(false);
   };
   
   const handleCompleteTouch = async (outcome: string, notes?: string) => {
     if (!completeDialogTouch) return;
     await completeTouch({ touchId: completeDialogTouch.id, outcome, outcomeNotes: notes });
     setCompleteDialogTouch(null);
   };
   
   const handleSnoozeTouch = async (snoozeUntil: string) => {
     if (!completeDialogTouch) return;
     await snoozeTouch({ touchId: completeDialogTouch.id, snoozeUntil });
     setCompleteDialogTouch(null);
   };
   
   const handleRescheduleTouch = async (newDate: string) => {
     if (!completeDialogTouch) return;
     await rescheduleTouch({ touchId: completeDialogTouch.id, newDate });
     setCompleteDialogTouch(null);
   };
   
   if (subLoading) {
     return (
       <div className="flex items-center justify-center h-48">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
     );
   }
   
   // Inactive state - no subscription
   if (!subscription) {
     return (
       <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
         <div className="p-4 rounded-full bg-muted">
           <HeartHandshake className="h-10 w-10 text-muted-foreground" />
         </div>
         <div className="space-y-2">
           <h3 className="text-lg font-semibold">Keep in Touch Not Active</h3>
           <p className="text-muted-foreground max-w-sm">
             Enable Keep in Touch to maintain regular contact with {entityName} through scheduled calls, messages, and visits.
           </p>
         </div>
         <Button onClick={() => setActivationOpen(true)}>
           <HeartHandshake className="h-4 w-4 mr-2" />
           Enable Keep in Touch
         </Button>
         
         <KitActivationDialog
           open={activationOpen}
           onOpenChange={setActivationOpen}
           entityType={entityType}
           entityId={entityId}
           entityName={entityName}
           defaultAssignee={defaultAssignee}
           onActivate={handleActivate}
           isLoading={isActivating}
         />
       </div>
     );
   }
   
   const preset = subscription.preset;
   const totalSteps = preset?.touch_sequence?.length || 0;
   const statusColor = KIT_SUBSCRIPTION_STATUS_COLORS[subscription.status];
   const statusLabel = KIT_SUBSCRIPTION_STATUS_LABELS[subscription.status];
   
   return (
     <div className="space-y-6">
       {/* Header Card */}
       <Card>
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <CardTitle className="flex items-center gap-2">
                 <HeartHandshake className="h-5 w-5" />
                 Keep in Touch
               </CardTitle>
               <Badge className={statusColor}>{statusLabel}</Badge>
             </div>
             <div className="flex items-center gap-2">
               {subscription.status === 'active' && (
                 <Button variant="outline" size="sm" onClick={() => setPauseOpen(true)}>
                   <Pause className="h-4 w-4 mr-1" />
                   Pause
                 </Button>
               )}
               {subscription.status === 'paused' && (
                 <Button size="sm" onClick={handleResume} disabled={isResuming}>
                   {isResuming ? (
                     <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                   ) : (
                     <Play className="h-4 w-4 mr-1" />
                   )}
                   Resume
                 </Button>
               )}
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => setCancelConfirmOpen(true)}
                 className="text-destructive hover:text-destructive"
               >
                 <X className="h-4 w-4" />
               </Button>
             </div>
           </div>
           {preset && <CardDescription>{preset.name}</CardDescription>}
         </CardHeader>
         <CardContent className="space-y-4">
           <KitProgressIndicator subscription={subscription} totalSteps={totalSteps} />
           
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
             <div>
               <p className="text-muted-foreground">Started</p>
               <p className="font-medium">
                 {subscription.started_at
                   ? format(parseISO(subscription.started_at), 'MMM d, yyyy')
                   : format(parseISO(subscription.created_at), 'MMM d, yyyy')}
               </p>
             </div>
             <div>
               <p className="text-muted-foreground">Assigned To</p>
               <p className="font-medium">{subscription.assigned_to}</p>
             </div>
             {subscription.status === 'paused' && subscription.pause_until && (
               <div>
                 <p className="text-muted-foreground">Auto-resumes</p>
                 <p className="font-medium flex items-center gap-1">
                   <Calendar className="h-3 w-3" />
                   {format(parseISO(subscription.pause_until), 'MMM d, yyyy')}
                 </p>
               </div>
             )}
             {subscription.pause_reason && (
               <div className="col-span-2">
                 <p className="text-muted-foreground">Pause Reason</p>
                 <p className="font-medium">{subscription.pause_reason}</p>
               </div>
             )}
           </div>
         </CardContent>
       </Card>
       
       {/* Upcoming Touch */}
       {nextTouch && subscription.status === 'active' && (
         <div className="space-y-3">
           <h4 className="font-semibold text-sm uppercase text-muted-foreground">Upcoming Touch</h4>
           <KitTouchCard
             touch={nextTouch}
             onComplete={() => setCompleteDialogTouch(nextTouch)}
             onSnooze={() => setCompleteDialogTouch(nextTouch)}
             onReschedule={() => setCompleteDialogTouch(nextTouch)}
             onSkip={() => skipTouch(nextTouch.id)}
             disabled={isCompleting || isSnoozing || isRescheduling}
           />
         </div>
       )}
       
       {/* Touch History */}
       {completedTouches.length > 0 && (
         <div className="space-y-3">
           <h4 className="font-semibold text-sm uppercase text-muted-foreground">Touch History</h4>
           <div className="space-y-2">
             {completedTouches.slice().reverse().map((touch) => (
               <KitTouchCard
                 key={touch.id}
                 touch={touch}
                 onComplete={() => {}}
                 onSnooze={() => {}}
                 onReschedule={() => {}}
                 isUpcoming
               />
             ))}
           </div>
         </div>
       )}
       
       {/* Remaining Touches */}
       {remainingTouches.length > 1 && (
         <div className="space-y-3">
           <h4 className="font-semibold text-sm uppercase text-muted-foreground">
             Remaining in Cycle ({remainingTouches.length - 1})
           </h4>
           <div className="space-y-2">
             {remainingTouches.slice(1).map((touch) => (
               <KitTouchCard
                 key={touch.id}
                 touch={touch}
                 onComplete={() => {}}
                 onSnooze={() => {}}
                 onReschedule={() => {}}
                 isUpcoming
               />
             ))}
           </div>
         </div>
       )}
       
       {/* Dialogs */}
       <KitTouchCompleteDialog
         open={!!completeDialogTouch}
         onOpenChange={(open) => !open && setCompleteDialogTouch(null)}
         touch={completeDialogTouch}
         entityName={entityName}
         onComplete={handleCompleteTouch}
         onSnooze={handleSnoozeTouch}
         onReschedule={handleRescheduleTouch}
         isLoading={isCompleting || isSnoozing || isRescheduling}
       />
       
       <KitPauseDialog
         open={pauseOpen}
         onOpenChange={setPauseOpen}
         onPause={handlePause}
         isLoading={isPausing}
       />
       
       <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Cancel Keep in Touch?</AlertDialogTitle>
             <AlertDialogDescription>
               This will stop all scheduled touches for {entityName}. This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Keep Active</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleCancel}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </div>
   );
 }