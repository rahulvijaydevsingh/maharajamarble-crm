import { supabase } from "@/integrations/supabase/client";

/**
 * Standalone staff activity logger that doesn't require React hooks.
 * Use this in data hooks (useLeads, useReminders, etc.) to avoid circular dependencies.
 */
export async function logToStaffActivity(
  actionType: string,
  userEmail: string,
  userId: string,
  description?: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
) {
  try {
    await (supabase.from("staff_activity_log" as any).insert as any)({
      user_id: userId,
      user_email: userEmail,
      action_type: actionType,
      action_description: description || null,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    console.warn("Failed to log staff activity:", err);
  }
}
