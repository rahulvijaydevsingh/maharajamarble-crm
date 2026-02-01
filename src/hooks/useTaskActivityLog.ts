import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TaskActivityLogEntry {
  id: string;
  task_id: string;
  event_type: string;
  metadata: Record<string, any>;
  notes: string | null;
  user_id: string | null;
  user_name: string;
  created_at: string;
}

function transformRow(row: any): TaskActivityLogEntry {
  return {
    ...row,
    metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata : {},
  };
}

export function useTaskActivityLog(taskId: string | null | undefined) {
  const [entries, setEntries] = useState<TaskActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 30;

  const fetchPage = useCallback(
    async (pageNum: number, reset: boolean) => {
      if (!taskId) {
        setEntries([]);
        setLoading(false);
        setHasMore(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("task_activity_log")
          .select("*")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        const next = (data || []).map(transformRow);
        setEntries((prev) => (reset ? next : [...prev, ...next]));
        setHasMore((data?.length || 0) === PAGE_SIZE);
        setPage(pageNum);
      } catch (e) {
        console.error("Failed to fetch task activity log:", e);
      } finally {
        setLoading(false);
      }
    },
    [taskId]
  );

  useEffect(() => {
    void fetchPage(0, true);
  }, [fetchPage]);

  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_activity_log:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_activity_log",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setEntries((prev) => [transformRow(payload.new), ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setEntries((prev) => prev.map((e) => (e.id === payload.new.id ? transformRow(payload.new) : e)));
          } else if (payload.eventType === "DELETE") {
            setEntries((prev) => prev.filter((e) => e.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) void fetchPage(page + 1, false);
  }, [fetchPage, hasMore, loading, page]);

  const refetch = useCallback(() => {
    void fetchPage(0, true);
  }, [fetchPage]);

  const sorted = useMemo(() => entries, [entries]);

  return { entries: sorted, loading, hasMore, loadMore, refetch };
}
