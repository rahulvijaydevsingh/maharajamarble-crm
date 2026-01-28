import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ActivityType, ActivityCategory } from '@/constants/activityLogConstants';
import { Json } from '@/integrations/supabase/types';

export interface ActivityLogEntry {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  activity_type: string;
  activity_category: string;
  user_id: string | null;
  user_name: string;
  activity_timestamp: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  attachments: any[];
  is_manual: boolean;
  is_editable: boolean;
  icon: string | null;
  color: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityParams {
  lead_id?: string;
  customer_id?: string;
  activity_type: ActivityType;
  activity_category: ActivityCategory;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  attachments?: any[];
  is_manual?: boolean;
  activity_timestamp?: string;
  related_entity_type?: string;
  related_entity_id?: string;
}

// Helper to transform database row to ActivityLogEntry
const transformActivityRow = (row: any): ActivityLogEntry => ({
  ...row,
  metadata: typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {},
  attachments: Array.isArray(row.attachments) ? row.attachments : [],
});

export function useActivityLog(leadId?: string, customerId?: string) {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = 30;

  const fetchActivities = useCallback(async (pageNum: number = 0, reset: boolean = false) => {
    if (!leadId && !customerId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('activity_timestamp', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (leadId) {
        query = query.eq('lead_id', leadId);
      } else if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transformedData = (data || []).map(transformActivityRow);

      if (reset) {
        setActivities(transformedData);
      } else {
        setActivities(prev => [...prev, ...transformedData]);
      }
      
      setHasMore((data?.length || 0) === PAGE_SIZE);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }, [leadId, customerId]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchActivities(page + 1);
    }
  }, [loading, hasMore, page, fetchActivities]);

  const createActivity = useCallback(async (params: CreateActivityParams) => {
    try {
      const userName = user?.email?.split('@')[0] || 'System';
      
      const { data, error } = await supabase
        .from('activity_log')
        .insert({
          lead_id: params.lead_id || leadId,
          customer_id: params.customer_id || customerId,
          activity_type: params.activity_type,
          activity_category: params.activity_category,
          user_id: user?.id || null,
          user_name: userName,
          title: params.title,
          description: params.description,
          metadata: (params.metadata || {}) as Json,
          attachments: (params.attachments || []) as Json,
          is_manual: params.is_manual || false,
          is_editable: false,
          activity_timestamp: params.activity_timestamp || new Date().toISOString(),
          related_entity_type: params.related_entity_type,
          related_entity_id: params.related_entity_id,
        })
        .select()
        .single();

      if (error) throw error;

      const transformedData = transformActivityRow(data);
      setActivities(prev => [transformedData, ...prev]);
      
      return transformedData;
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  }, [leadId, customerId, user]);

  const updateActivity = useCallback(async (id: string, updates: Partial<ActivityLogEntry>) => {
    try {
      const dbUpdates: Record<string, any> = { ...updates };
      if (updates.metadata) {
        dbUpdates.metadata = updates.metadata as Json;
      }
      if (updates.attachments) {
        dbUpdates.attachments = updates.attachments as Json;
      }

      const { data, error } = await supabase
        .from('activity_log')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const transformedData = transformActivityRow(data);
      setActivities(prev => prev.map(a => a.id === id ? transformedData : a));
      
      toast({
        title: "Activity Updated",
        description: "The activity entry has been updated.",
      });
      
      return transformedData;
    } catch (error) {
      console.error('Error updating activity:', error);
      toast({
        title: "Error",
        description: "Failed to update activity.",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  const deleteActivity = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('activity_log')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setActivities(prev => prev.filter(a => a.id !== id));
      
      toast({
        title: "Activity Deleted",
        description: "The activity entry has been removed.",
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast({
        title: "Error",
        description: "Failed to delete activity.",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    fetchActivities(0, true);
  }, [fetchActivities]);

  // Realtime subscription
  useEffect(() => {
    if (!leadId && !customerId) return;

    const channel = supabase
      .channel('activity_log_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_log',
          filter: leadId ? `lead_id=eq.${leadId}` : `customer_id=eq.${customerId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setActivities(prev => [transformActivityRow(payload.new), ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setActivities(prev => 
              prev.map(a => a.id === payload.new.id ? transformActivityRow(payload.new) : a)
            );
          } else if (payload.eventType === 'DELETE') {
            setActivities(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, customerId]);

  return {
    activities,
    loading,
    hasMore,
    loadMore,
    createActivity,
    updateActivity,
    deleteActivity,
    refetch: () => fetchActivities(0, true),
  };
}

// Helper hook for logging activities from other modules
export function useLogActivity() {
  const { user } = useAuth();

  const logActivity = useCallback(async (params: CreateActivityParams) => {
    try {
      const userName = user?.email?.split('@')[0] || 'System';
      
      const { error } = await supabase
        .from('activity_log')
        .insert({
          lead_id: params.lead_id,
          customer_id: params.customer_id,
          activity_type: params.activity_type,
          activity_category: params.activity_category,
          user_id: user?.id || null,
          user_name: userName,
          title: params.title,
          description: params.description,
          metadata: (params.metadata || {}) as Json,
          attachments: (params.attachments || []) as Json,
          is_manual: params.is_manual || false,
          is_editable: false,
          activity_timestamp: params.activity_timestamp || new Date().toISOString(),
          related_entity_type: params.related_entity_type,
          related_entity_id: params.related_entity_id,
        });

      if (error) {
        console.error('Error logging activity:', error);
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }, [user]);

  return { logActivity };
}
