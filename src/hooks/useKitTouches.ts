import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, getDay } from 'date-fns';
import type {
  KitTouch,
  KitTouchStatus,
  KitTouchMethod,
  KitPreset,
  KitTouchSequenceItem,
} from '@/constants/kitConstants';

// Helper to adjust for weekends
function adjustForWeekend(date: Date, skipWeekends: boolean): Date {
  if (!skipWeekends) return date;
  const day = getDay(date);
  if (day === 0) return addDays(date, 1); // Sunday -> Monday
  return date;
}

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
        .order('scheduled_date')
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

  // Check if cycle is complete (all touches in terminal state)
  const checkCycleComplete = async (subId: string): Promise<{ isComplete: boolean; behavior: string | null }> => {
    const { data: touches } = await supabase
      .from('kit_touches')
      .select('status')
      .eq('subscription_id', subId);

    const { data: subscription } = await supabase
      .from('kit_subscriptions')
      .select('preset:kit_presets(default_cycle_behavior), max_cycles, cycle_count')
      .eq('id', subId)
      .single();

    const allTerminal = touches?.every(t => 
      ['completed', 'skipped', 'missed'].includes(t.status)
    );

    const preset = subscription?.preset as unknown as { default_cycle_behavior: string } | null;
    const behavior = preset?.default_cycle_behavior || 'user_defined';
    
    // If max cycles reached, don't allow repeat
    if (subscription?.max_cycles && subscription.cycle_count >= subscription.max_cycles) {
      return { isComplete: allTerminal || false, behavior: 'one_time' };
    }

    return { isComplete: allTerminal || false, behavior };
  };

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
      const skipWeekends = subscription.skip_weekends || false;
      
      // Check if all touches are in terminal state
      const cycleStatus = await checkCycleComplete(touch.subscription_id);
      
      if (cycleStatus.isComplete) {
        const behavior = cycleStatus.behavior || 'user_defined';
        
        if (behavior === 'auto_repeat') {
          // Auto create next cycle
          await createNextCycle(subscription, touchSequence, skipWeekends);
        } else if (behavior === 'one_time') {
          // Complete subscription
          await supabase
            .from('kit_subscriptions')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', subscription.id);

          const tableName = subscription.entity_type === 'lead' ? 'leads' : 
                          subscription.entity_type === 'customer' ? 'customers' : 'professionals';
          await supabase.from(tableName).update({ kit_subscription_id: null, kit_status: 'none' }).eq('id', subscription.entity_id);
        }
        // For 'user_defined', we return the status and let the UI handle it
      } else {
        // Update current step
        await supabase
          .from('kit_subscriptions')
          .update({ current_step: touch.sequence_index + 1 })
          .eq('id', subscription.id);
      }

      return { touch, cycleComplete: cycleStatus.isComplete, behavior: cycleStatus.behavior };
    },
    onSuccess: (result) => {
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
      const { data: touch } = await supabase
        .from('kit_touches')
        .update({ status: 'skipped' })
        .eq('id', touchId)
        .select('subscription_id')
        .single();

      if (!touch) throw new Error('Touch not found');

      // Check if cycle is complete
      const cycleStatus = await checkCycleComplete(touch.subscription_id);
      
      return { touchId, cycleComplete: cycleStatus.isComplete, behavior: cycleStatus.behavior };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Touch skipped' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error skipping touch', description: error.message, variant: 'destructive' });
    },
  });

  // Reassign a touch
  const reassignMutation = useMutation({
    mutationFn: async ({ touchId, newAssignee }: { touchId: string; newAssignee: string }) => {
      const { error } = await supabase
        .from('kit_touches')
        .update({ assigned_to: newAssignee })
        .eq('id', touchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Touch reassigned' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error reassigning touch', description: error.message, variant: 'destructive' });
    },
  });

  // Add a new touch to subscription
  const addTouchMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      method,
      scheduledDate,
      scheduledTime,
      assignedTo,
    }: {
      subscriptionId: string;
      method: string;
      scheduledDate: string;
      scheduledTime?: string;
      assignedTo: string;
    }) => {
      // Get the max sequence index
      const { data: existingTouches } = await supabase
        .from('kit_touches')
        .select('sequence_index')
        .eq('subscription_id', subscriptionId)
        .order('sequence_index', { ascending: false })
        .limit(1);

      const maxIndex = existingTouches?.[0]?.sequence_index ?? -1;

      const { error } = await supabase.from('kit_touches').insert({
        subscription_id: subscriptionId,
        method,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || null,
        assigned_to: assignedTo,
        sequence_index: maxIndex + 1,
        status: 'pending',
        original_scheduled_date: scheduledDate,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Touch added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding touch', description: error.message, variant: 'destructive' });
    },
  });

  // Update a touch
  const updateTouchMutation = useMutation({
    mutationFn: async ({
      touchId,
      updates,
    }: {
      touchId: string;
      updates: {
        method?: string;
        scheduled_date?: string;
        scheduled_time?: string | null;
        assigned_to?: string;
      };
    }) => {
      const { error } = await supabase
        .from('kit_touches')
        .update(updates)
        .eq('id', touchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Touch updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating touch', description: error.message, variant: 'destructive' });
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
    reassignTouch: reassignMutation.mutateAsync,
    addTouch: addTouchMutation.mutateAsync,
    updateTouch: updateTouchMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
    isRescheduling: rescheduleMutation.isPending,
    isSkipping: skipMutation.isPending,
    isReassigning: reassignMutation.isPending,
    isAdding: addTouchMutation.isPending,
    isUpdating: updateTouchMutation.isPending,
  };
}

// Helper function to create next cycle touches
async function createNextCycle(
  subscription: {
    id: string;
    cycle_count: number;
    assigned_to: string;
    entity_type: string;
    entity_id: string;
  },
  touchSequence: KitTouchSequenceItem[],
  skipWeekends: boolean
) {
  let currentDate = new Date();
  const touches = touchSequence.map((item, index) => {
    currentDate = addDays(currentDate, item.interval_days);
    currentDate = adjustForWeekend(currentDate, skipWeekends);
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
