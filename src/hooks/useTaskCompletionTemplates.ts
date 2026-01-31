import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TaskCompletionTemplate {
  id: string;
  name: string;
  task_type: string;
  template_notes: string;
  default_outcome: string | null;
  default_completion_status: string | null;
  default_next_action_type: string | null;
  default_next_action_payload: any | null;
  is_active: boolean;
  sort_order: number;
}

export function useTaskCompletionTemplates(taskType?: string | null) {
  const [templates, setTemplates] = useState<TaskCompletionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("task_completion_templates")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (taskType) {
          query = query.eq("task_type", taskType);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!cancelled) setTemplates((data || []) as unknown as TaskCompletionTemplate[]);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load templates");
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [taskType]);

  const hasTemplates = useMemo(() => templates.length > 0, [templates]);

  return { templates, hasTemplates, loading, error };
}
