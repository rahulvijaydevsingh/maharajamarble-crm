import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Records an event on a task's own trail (`task_activity_log`) — the table
 * the desktop completion dialog writes to.
 *
 * The entry is informational: a failure is swallowed, because a task write
 * must never be blocked by the activity trail.
 */
export async function logTaskActivity(
  taskId: string,
  eventType: string,
  metadata: Json,
  staffName: string,
  userId?: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('task_activity_log').insert({
      task_id: taskId,
      event_type: eventType,
      user_id: userId ?? null,
      user_name: staffName,
      metadata,
      notes: null,
    });
    if (error) {
      // The activity trail is informational — never block the task write.
      console.warn('[mobile/logTaskActivity] Could not record the task event:', error.message);
    }
  } catch {
    // The activity trail is informational — never block the task write.
  }
}
