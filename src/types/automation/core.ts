// Automation System Types (core primitives)

export type EntityType = "leads" | "tasks" | "customers" | "professionals" | "quotations" | "kit" | "staff_activity";

export type TriggerType = "field_change" | "time_based" | "count_based" | "saved_filter";

export type ExecutionLimit = "once_per_record" | "once_daily" | "unlimited" | "max_limit";

export type ExecutionStatus = "success" | "failed" | "partial_success" | "in_progress";

export type ActionType =
  | "create_task"
  | "create_reminder"
  | "send_notification"
  | "send_message"
  | "update_field"
  | "send_email"
  | "execute_webhook"
  | "trigger_automation";

export type ConditionLogic = "and" | "or";

export type NotificationType = "info" | "success" | "warning" | "error" | "automation";
export type NotificationPriority = "normal" | "important" | "urgent";
