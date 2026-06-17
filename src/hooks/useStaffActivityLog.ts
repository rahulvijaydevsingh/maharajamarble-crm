import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface StaffActivityEntry {
  id: string;
  user_id: string;
  user_email: string;
  action_type: string;
  action_description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function useStaffActivityLog() {
  const { user, profile } = useAuth();
  const [activities, setActivities] = useState<StaffActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const logStaffAction = useCallback(
    async (
      actionType: string,
      description?: string,
      entityType?: string,
      entityId?: string,
      metadata?: Record<string, any>
    ) => {
      if (!user) return;
      try {
        await (supabase.from("staff_activity_log" as any).insert as any)({
          user_id: user.id,
          user_email: profile?.email || user.email || "unknown",
          action_type: actionType,
          action_description: description || null,
          entity_type: entityType || null,
          entity_id: entityId || null,
          metadata: metadata || {},
          user_agent: navigator.userAgent,
        });
      } catch (err) {
        console.error("Failed to log staff action:", err);
      }
    },
    [user, profile]
  );

  const fetchActivities = useCallback(
    async (filters?: {
      userId?: string;
      actionType?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      setLoading(true);
      try {
        let query = (supabase.from("staff_activity_log" as any).select("*") as any)
          .order("created_at", { ascending: false })
          .limit(500);

        if (filters?.userId) {
          query = query.eq("user_id", filters.userId);
        }
        if (filters?.actionType) {
          query = query.eq("action_type", filters.actionType);
        }
        if (filters?.startDate) {
          query = query.gte("created_at", filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte("created_at", filters.endDate);
        }

        const { data, error } = await query;
        if (error) throw error;
        setActivities((data as StaffActivityEntry[]) || []);
      } catch (err) {
        console.error("Error fetching staff activities:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    activities,
    loading,
    logStaffAction,
    fetchActivities,
  };
}
