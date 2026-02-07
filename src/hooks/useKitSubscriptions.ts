import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, format, getDay } from 'date-fns';
import type {
  KitSubscription,
  KitSubscriptionStatus,
  KitEntityType,
  KitPreset,
  KitTouchSequenceItem,
  KitCycleBehavior,
} from '@/constants/kitConstants';

interface ActivateKitParams {
  entityType: KitEntityType;
  entityId: string;
  presetId: string | null;
  assignedTo: string;
  maxCycles?: number;
  customSequence?: KitTouchSequenceItem[];
  skipWeekends?: boolean;
}

// Helper to adjust for weekends
function adjustForWeekend(date: Date, skipWeekends: boolean): Date {
  if (!skipWeekends) return date;
  const day = getDay(date);
  if (day === 0) return addDays(date, 1); // Sunday -> Monday
  return date;
}

export function useKitSubscriptions(entityType?: KitEntityType, entityId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch subscription for a specific entity
  const subscriptionQuery = useQuery({
    queryKey: ['kit-subscription', entityType, entityId],
    queryFn: async (): Promise<KitSubscription | null> => {
      if (!entityType || !entityId) return null;

      const { data, error } = await supabase
        .from('kit_subscriptions')
        .select('*, preset:kit_presets(*)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const preset = data.preset as unknown as KitPreset | null;
      
      return {
        ...data,
        status: data.status as KitSubscriptionStatus,
        entity_type: data.entity_type as KitEntityType,
        preset: preset ? {
          ...preset,
          touch_sequence: (preset.touch_sequence as unknown as KitTouchSequenceItem[]) || [],
          default_cycle_behavior: preset.default_cycle_behavior as KitCycleBehavior,
        } : undefined,
      };
    },
    enabled: !!entityType && !!entityId,
  });

  // Activate KIT on an entity
  const activateMutation = useMutation({
    mutationFn: async ({ 
      entityType, 
      entityId, 
      presetId, 
      assignedTo, 
      maxCycles,
      customSequence,
      skipWeekends = false,
    }: ActivateKitParams) => {
      let touchSequence: KitTouchSequenceItem[] = [];
      
      if (presetId) {
        // Get the preset
        const { data: preset, error: presetError } = await supabase
          .from('kit_presets')
          .select('*')
          .eq('id', presetId)
          .single();

        if (presetError) throw presetError;
        touchSequence = (preset.touch_sequence as unknown as KitTouchSequenceItem[]) || [];
      } else if (customSequence) {
        // Use custom sequence
        touchSequence = customSequence;
      }

      if (touchSequence.length === 0) {
        throw new Error('Touch sequence cannot be empty');
      }

      // Create subscription
      const { data: subscription, error: subError } = await supabase
        .from('kit_subscriptions')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          preset_id: presetId,
          status: 'active',
          assigned_to: assignedTo,
          max_cycles: maxCycles || null,
          skip_weekends: skipWeekends,
          created_by: user?.email || 'system',
        })
        .select()
        .single();

      if (subError) throw subError;

      // Create touches for the first cycle
      let currentDate = new Date();
      const touches = touchSequence.map((item, index) => {
        currentDate = addDays(currentDate, item.interval_days);
        currentDate = adjustForWeekend(currentDate, skipWeekends);
        return {
          subscription_id: subscription.id,
          sequence_index: index,
          method: item.method,
          scheduled_date: format(currentDate, 'yyyy-MM-dd'),
          assigned_to: assignedTo,
          original_scheduled_date: format(currentDate, 'yyyy-MM-dd'),
        };
      });

      if (touches.length > 0) {
        const { error: touchError } = await supabase.from('kit_touches').insert(touches);
        if (touchError) throw touchError;
      }

      // Update entity with kit_subscription_id and kit_status
      const tableName = entityType === 'lead' ? 'leads' : entityType === 'customer' ? 'customers' : 'professionals';
      const { error: entityError } = await supabase
        .from(tableName)
        .update({ kit_subscription_id: subscription.id, kit_status: 'active' })
        .eq('id', entityId);

      if (entityError) throw entityError;

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Keep in Touch activated!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error activating KIT', description: error.message, variant: 'destructive' });
    },
  });

  // Pause subscription
  const pauseMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      pauseUntil,
      pauseReason,
    }: {
      subscriptionId: string;
      pauseUntil?: string;
      pauseReason?: string;
    }) => {
      const { data: sub } = await supabase
        .from('kit_subscriptions')
        .select('entity_type, entity_id')
        .eq('id', subscriptionId)
        .single();

      const { error } = await supabase
        .from('kit_subscriptions')
        .update({
          status: 'paused',
          pause_until: pauseUntil || null,
          pause_reason: pauseReason || null,
        })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update entity kit_status
      if (sub) {
        const tableName = sub.entity_type === 'lead' ? 'leads' : sub.entity_type === 'customer' ? 'customers' : 'professionals';
        await supabase.from(tableName).update({ kit_status: 'paused' }).eq('id', sub.entity_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Keep in Touch paused' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error pausing KIT', description: error.message, variant: 'destructive' });
    },
  });

  // Resume subscription
  const resumeMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data: sub } = await supabase
        .from('kit_subscriptions')
        .select('entity_type, entity_id')
        .eq('id', subscriptionId)
        .single();

      const { error } = await supabase
        .from('kit_subscriptions')
        .update({
          status: 'active',
          pause_until: null,
          pause_reason: null,
        })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update entity kit_status
      if (sub) {
        const tableName = sub.entity_type === 'lead' ? 'leads' : sub.entity_type === 'customer' ? 'customers' : 'professionals';
        await supabase.from(tableName).update({ kit_status: 'active' }).eq('id', sub.entity_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Keep in Touch resumed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error resuming KIT', description: error.message, variant: 'destructive' });
    },
  });

  // Cancel subscription
  const cancelMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data: sub } = await supabase
        .from('kit_subscriptions')
        .select('entity_type, entity_id')
        .eq('id', subscriptionId)
        .single();

      const { error } = await supabase
        .from('kit_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update entity kit_status
      if (sub) {
        const tableName = sub.entity_type === 'lead' ? 'leads' : sub.entity_type === 'customer' ? 'customers' : 'professionals';
        await supabase.from(tableName).update({ kit_subscription_id: null, kit_status: 'none' }).eq('id', sub.entity_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Keep in Touch cancelled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error cancelling KIT', description: error.message, variant: 'destructive' });
    },
  });

  // Create next cycle
  const createNextCycleMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data: subscription, error: subError } = await supabase
        .from('kit_subscriptions')
        .select('*, preset:kit_presets(*)')
        .eq('id', subscriptionId)
        .single();

      if (subError) throw subError;

      const preset = subscription.preset as unknown as KitPreset | null;
      const touchSequence = preset?.touch_sequence || [];
      const skipWeekends = subscription.skip_weekends || false;

      if (touchSequence.length === 0) {
        throw new Error('No touch sequence defined');
      }

      let currentDate = new Date();
      const touches = touchSequence.map((item: KitTouchSequenceItem, index: number) => {
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
          cycle_count: (subscription.cycle_count || 1) + 1,
          current_step: 0,
        })
        .eq('id', subscription.id);

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-touches'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'New cycle started!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error starting new cycle', description: error.message, variant: 'destructive' });
    },
  });

  // Complete subscription
  const completeSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data: sub } = await supabase
        .from('kit_subscriptions')
        .select('entity_type, entity_id')
        .eq('id', subscriptionId)
        .single();

      const { error } = await supabase
        .from('kit_subscriptions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update entity kit_status
      if (sub) {
        const tableName = sub.entity_type === 'lead' ? 'leads' : sub.entity_type === 'customer' ? 'customers' : 'professionals';
        await supabase.from(tableName).update({ kit_subscription_id: null, kit_status: 'none' }).eq('id', sub.entity_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['kit-dashboard'] });
      toast({ title: 'Keep in Touch completed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error completing KIT', description: error.message, variant: 'destructive' });
    },
  });

  return {
    subscription: subscriptionQuery.data,
    loading: subscriptionQuery.isLoading,
    error: subscriptionQuery.error,
    activateKit: activateMutation.mutateAsync,
    pauseSubscription: pauseMutation.mutateAsync,
    resumeSubscription: resumeMutation.mutateAsync,
    cancelSubscription: cancelMutation.mutateAsync,
    createNextCycle: createNextCycleMutation.mutateAsync,
    completeSubscription: completeSubscriptionMutation.mutateAsync,
    isActivating: activateMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isCreatingCycle: createNextCycleMutation.isPending,
    isCompleting: completeSubscriptionMutation.isPending,
  };
}
