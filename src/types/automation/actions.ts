import type { ActionType, EntityType, NotificationPriority } from "./core";
import type { TriggerCondition } from "./triggers";

// Action Configurations
export interface CreateTaskActionConfig {
  title: string;
  description?: string;
  type: string;
  priority: string;
  assigned_to_type: "trigger.assigned_to" | "trigger.created_by" | "specific_user";
  assigned_to_user?: string;
  due_date_type: "today" | "tomorrow" | "relative" | "absolute";
  due_date_offset?: number;
  due_date_offset_unit?: "hours" | "days" | "weeks";
  due_date_absolute?: string;
  due_time_type: "current" | "relative" | "specific";
  due_time_offset?: number;
  due_time_specific?: string;
  reminder_enabled?: boolean;
  reminder_before?: string;
  link_to_trigger?: boolean;
  is_starred?: boolean;
}

export interface CreateReminderActionConfig {
  title: string;
  description?: string;
  reminder_datetime_type: "relative" | "absolute";
  reminder_offset?: number;
  reminder_offset_unit?: "hours" | "days";
  reminder_datetime_absolute?: string;
  assigned_to_type: "trigger.assigned_to" | "trigger.created_by" | "specific_user";
  assigned_to_user?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
}

export interface SendNotificationActionConfig {
  notification_type: "in_app" | "email" | "sms" | "all";
  recipients: string[];
  title: string;
  message: string;
  priority?: NotificationPriority;
  include_link?: boolean;
}

export interface SendMessageActionConfig {
  recipient_type: "trigger.assigned_to" | "trigger.created_by" | "specific_user" | "all_managers";
  specific_user_id?: string;
  message: string;
  include_record_link?: boolean;
}

export interface UpdateFieldActionConfig {
  target: "trigger_record" | "related_record";
  related_entity_type?: EntityType;
  field: string;
  value: string | number | boolean;
  operation?: "set" | "increment" | "decrement" | "append";
}

export interface SendEmailActionConfig {
  template_id?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments?: string[];
  send_timing: "immediately" | "delayed" | "scheduled";
  delay_hours?: number;
  scheduled_datetime?: string;
}

export interface ExecuteWebhookActionConfig {
  url: string;
  method: "POST" | "PUT" | "PATCH" | "GET";
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
  retry_logic: "none" | "retry_3" | "retry_5";
  error_handling: "ignore" | "stop" | "notify";
}

export interface TriggerAutomationActionConfig {
  target_rule_id: string;
  pass_variables?: boolean;
}

export type ActionConfig =
  | CreateTaskActionConfig
  | CreateReminderActionConfig
  | SendNotificationActionConfig
  | SendMessageActionConfig
  | UpdateFieldActionConfig
  | SendEmailActionConfig
  | ExecuteWebhookActionConfig
  | TriggerAutomationActionConfig;

export interface AutomationAction {
  id: string;
  type: ActionType;
  config: ActionConfig;
  condition?: TriggerCondition;
  delay_minutes?: number;
  order: number;
}
