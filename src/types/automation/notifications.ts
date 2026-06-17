import type { NotificationPriority, NotificationType } from "./core";

// Notification Type
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message?: string;
  type: NotificationType;
  priority: NotificationPriority;
  entity_type?: string;
  entity_id?: string;
  related_automation_rule_id?: string;
  is_read: boolean;
  is_dismissed: boolean;
  action_url?: string;
  created_at: string;
}
