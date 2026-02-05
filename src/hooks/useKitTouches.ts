 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useToast } from '@/hooks/use-toast';
 import { format, addDays, parseISO } from 'date-fns';
 import type {
   KitTouch,
   KitTouchStatus,
   KitTouchMethod,
   KitSubscription,
   KitSubscriptionStatus,
   KitEntityType,
   KitPreset,
   KitTouchSequenceItem,
   KitCycleBehavior,
 } from '@/constants/kitConstants';
 
 export function useKitTouches(subscriptionId?: string) {
   const { toast } = useToast();
   const queryClient = useQueryClient();
 
   // Fetch touches for a subscription
   const touchesQuery = useQuery({
     queryKey: ['kit-touches', subscriptionId],
     queryFn: async (): Promise<KitTouch[]> => {
       if (!subscriptionId) return [];
 
       const { data, error } = await supabase
         .from('kit_touches')
         .select('*')
         .eq('subscription_id', subscriptionId)
         .order('sequence_index');
 
       if (error) throw error;
 
       return (data || []).map(touch => ({
         ...touch,
         method: touch.method as KitTouchMethod,
         status: touch.status as KitTouchStatus,
       }));
     },
     enabled: !!subscriptionId,
   });
 
   // Get next pending touch
   const nextTouch = touchesQuery.data?.find(t => t.status === 'pending');
 
   // Get completed touches
   const completedTouches = touchesQuery.data?.filter(t => t.status === 'completed') || [];
 
   // Get remaining touches
   const remainingTouches = touchesQuery.data?.filter(t => t.status === 'pending') || [];
 
   // Complete a touch
   const completeMutation = useMutation({
     mutationFn: async ({
       touchId,
       outcome,
       outcomeNotes,
     }: {
       touchId: string;
       outcome: string;
       outcomeNotes?: string;
     }) => {
       const { data: touch, error: touchError } = await supabase
         .from('kit_touches')
         .update({
           status: 'completed',
           outcome,
           outcome_notes: outcomeNotes || null,
           completed_at: new Date().toISOString(),
         })
         .eq('id', touchId)
         .select('subscription_id, sequence_index')
         .single();
 
       if (touchError) throw touchError;
 
       // Update subscription current_step
       const { data: subscription, error: subError } = await supabase
         .from('kit_subscriptions')
         .select('*, preset:kit_presets(*)')
         .eq('id', touch.subscription_id)
         .single();
 
       if (subError) throw subError;
 
       const preset = subscription.preset as unknown as KitPreset | null;
       const touchSequence = preset?.touch_sequence as unknown as KitTouchSequenceItem[] || [];
       const isLastTouch = touch.sequence_index >= touchSequence.length - 1;
 
       if (isLastTouch) {
         // Cycle completed - check behavior
         const behavior = preset?.default_cycle_behavior || 'user_defined';
         
         if (behavior === 'auto_repeat' && (!subscription.max_cycles || subscription.cycle_count < subscription.max_cycles)) {
           // Create next cycle
           await createNextCycle(subscription);
         } else if (behavior === 'one_time' || (subscription.max_cycles && subscription.cycle_count >= subscription.max_cycles)) {
           // Complete subscription
           await supabase
             .from('kit_subscriptions')
             .update({ status: 'completed', completed_at: new Date().toISOString() })
             .eq('id', subscription.id);
 
           // Update entity
           const tableName = subscription.entity_type === 'lead' ? 'leads' : subscription.entity_type === 'customer' ? 'customers' : 'professionals';
           await supabase.from(tableName).update({ kit_subscription_id: null, kit_status: 'none' }).eq('id', subscription.entity_id);
         }
         // For 'user_defined', we'll prompt the user via UI
       } else {
         // Update current step
         await supabase
           .from('kit_subscriptions')
           .update({ current_step: touch.sequence_index + 1 })
           .eq('id', subscription.id);
       }
 
       return touch;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
       queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
       queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
       toast({ title: 'Touch logged successfully' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error logging touch', description: error.message, variant: 'destructive' });
     },
   });
 
   // Snooze a touch
   const snoozeMutation = useMutation({
     mutationFn: async ({ touchId, snoozeUntil }: { touchId: string; snoozeUntil: string }) => {
       const { error } = await supabase
         .from('kit_touches')
         .update({
           status: 'snoozed',
           snoozed_until: snoozeUntil,
         })
         .eq('id', touchId);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
       queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
       toast({ title: 'Touch snoozed' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error snoozing touch', description: error.message, variant: 'destructive' });
     },
   });
 
   // Reschedule a touch
   const rescheduleMutation = useMutation({
     mutationFn: async ({ touchId, newDate }: { touchId: string; newDate: string }) => {
       const { data: touch } = await supabase.from('kit_touches').select('scheduled_date, reschedule_count').eq('id', touchId).single();
 
       const { error } = await supabase
         .from('kit_touches')
         .update({
           scheduled_date: newDate,
           status: 'pending',
           snoozed_until: null,
           reschedule_count: (touch?.reschedule_count || 0) + 1,
         })
         .eq('id', touchId);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
       queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
       toast({ title: 'Touch rescheduled' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error rescheduling touch', description: error.message, variant: 'destructive' });
     },
   });
 
   // Skip a touch
   const skipMutation = useMutation({
     mutationFn: async (touchId: string) => {
       const { error } = await supabase.from('kit_touches').update({ status: 'skipped' }).eq('id', touchId);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
       queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
       toast({ title: 'Touch skipped' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error skipping touch', description: error.message, variant: 'destructive' });
     },
   });
 
   return {
     touches: touchesQuery.data || [],
     nextTouch,
     completedTouches,
     remainingTouches,
     loading: touchesQuery.isLoading,
     error: touchesQuery.error,
     completeTouch: completeMutation.mutateAsync,
     snoozeTouch: snoozeMutation.mutateAsync,
     rescheduleTouch: rescheduleMutation.mutateAsync,
     skipTouch: skipMutation.mutateAsync,
     isCompleting: completeMutation.isPending,
     isSnoozing: snoozeMutation.isPending,
     isRescheduling: rescheduleMutation.isPending,
     isSkipping: skipMutation.isPending,
   };
 }
 
 // Helper function to create next cycle touches
 async function createNextCycle(subscription: {
   id: string;
   cycle_count: number;
   assigned_to: string;
   preset: unknown;
 }) {
   const preset = subscription.preset as KitPreset | null;
   if (!preset) return;
 
   const touchSequence = preset.touch_sequence || [];
 
   let currentDate = new Date();
   const touches = touchSequence.map((item, index) => {
     currentDate = addDays(currentDate, item.interval_days);
     return {
       subscription_id: subscription.id,
       sequence_index: index,
       method: item.method,
       scheduled_date: format(currentDate, 'yyyy-MM-dd'),
       assigned_to: subscription.assigned_to,
       original_scheduled_date: format(currentDate, 'yyyy-MM-dd'),
     };
   });
 
   if (touches.length > 0) {
     await supabase.from('kit_touches').insert(touches);
   }
 
   // Update cycle count and reset step
   await supabase
     .from('kit_subscriptions')
     .update({
       cycle_count: subscription.cycle_count + 1,
       current_step: 0,
     })
     .eq('id', subscription.id);
 }