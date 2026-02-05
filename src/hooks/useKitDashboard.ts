 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { format, isToday, isBefore, startOfDay } from 'date-fns';
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
 
 interface KitTouchWithEntity extends KitTouch {
   subscription: KitSubscription & {
     entity_name?: string;
   };
 }
 
 interface KitDashboardData {
   dueNow: KitTouchWithEntity[];
   overdue: KitTouchWithEntity[];
   upcoming: KitTouchWithEntity[];
   todayCount: number;
   overdueCount: number;
   upcomingCount: number;
 }
 
 export function useKitDashboard(assignedTo?: string) {
   const dashboardQuery = useQuery({
     queryKey: ['kit-dashboard', assignedTo],
     queryFn: async (): Promise<KitDashboardData> => {
       const today = format(new Date(), 'yyyy-MM-dd');
 
       // Fetch pending touches with subscription info
       const { data: touches, error } = await supabase
         .from('kit_touches')
         .select(`
           *,
           subscription:kit_subscriptions(
             *,
             preset:kit_presets(*)
           )
         `)
         .in('status', ['pending', 'snoozed'])
         .order('scheduled_date')
         .limit(50);
 
       if (error) throw error;
 
       const processedTouches: KitTouchWithEntity[] = [];
 
       for (const touch of touches || []) {
         const sub = touch.subscription as unknown as (KitSubscription & { preset: KitPreset | null }) | null;
         if (!sub || sub.status !== 'active') continue;
 
         // Filter by assignee if provided
         if (assignedTo && touch.assigned_to !== assignedTo) continue;
 
         // Get entity name based on type
         let entityName = 'Unknown';
         try {
           const tableName = sub.entity_type === 'lead' ? 'leads' : sub.entity_type === 'customer' ? 'customers' : 'professionals';
           const { data: entity } = await supabase
             .from(tableName)
             .select('name')
             .eq('id', sub.entity_id)
             .single();
           if (entity) entityName = entity.name;
         } catch {
           // Entity may have been deleted
         }
 
         processedTouches.push({
           ...touch,
           method: touch.method as KitTouchMethod,
           status: touch.status as KitTouchStatus,
           subscription: {
             ...sub,
             status: sub.status as KitSubscriptionStatus,
             entity_type: sub.entity_type as KitEntityType,
             entity_name: entityName,
             preset: sub.preset ? {
               ...sub.preset,
               touch_sequence: (sub.preset.touch_sequence as unknown as KitTouchSequenceItem[]) || [],
               default_cycle_behavior: sub.preset.default_cycle_behavior as KitCycleBehavior,
             } : undefined,
           },
         });
       }
 
       const todayStart = startOfDay(new Date());
 
       const dueNow = processedTouches.filter(t => {
         const scheduled = new Date(t.scheduled_date);
         return isToday(scheduled) && t.status === 'pending';
       });
 
       const overdue = processedTouches.filter(t => {
         const scheduled = new Date(t.scheduled_date);
         return isBefore(scheduled, todayStart) && t.status === 'pending';
       });
 
       const upcoming = processedTouches.filter(t => {
         const scheduled = new Date(t.scheduled_date);
         return !isToday(scheduled) && !isBefore(scheduled, todayStart) && t.status === 'pending';
       });
 
       return {
         dueNow,
         overdue,
         upcoming: upcoming.slice(0, 5), // Limit upcoming to 5
         todayCount: dueNow.length,
         overdueCount: overdue.length,
         upcomingCount: upcoming.length,
       };
     },
     refetchInterval: 60000, // Refresh every minute
   });
 
   return {
     data: dashboardQuery.data,
     loading: dashboardQuery.isLoading,
     error: dashboardQuery.error,
     refetch: dashboardQuery.refetch,
   };
 }