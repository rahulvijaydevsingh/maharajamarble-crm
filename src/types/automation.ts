// Automation System Types

export type EntityType = 'leads' | 'tasks' | 'customers' | 'professionals' | 'quotations';

export type TriggerType = 'field_change' | 'time_based' | 'count_based' | 'saved_filter';

export type ExecutionLimit = 'once_per_record' | 'once_daily' | 'unlimited' | 'max_limit';

export type ExecutionStatus = 'success' | 'failed' | 'partial_success' | 'in_progress';

export type ActionType = 
  | 'create_task'
  | 'create_reminder'
  | 'send_notification'
  | 'send_message'
  | 'update_field'
  | 'send_email'
  | 'execute_webhook'
  | 'trigger_automation';

export type ConditionLogic = 'and' | 'or';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'automation';
export type NotificationPriority = 'normal' | 'important' | 'urgent';

// Field Change Trigger Config
export interface FieldChangeTriggerConfig {
  when: 'field_changes_to' | 'field_changes_from_to' | 'any_field_updated' | 'record_created' | 'record_deleted';
  field?: string;
  value?: string | number | boolean;
  from_value?: string | number | boolean;
  to_value?: string | number | boolean;
  operator?: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
}

// Time Based Trigger Config
export interface TimeBasedTriggerConfig {
  timing_type: 'relative_to_field' | 'relative_to_creation' | 'absolute';
  field?: string;
  offset_value?: number;
  offset_unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  offset_direction?: 'before' | 'after';
  schedule?: {
    type: 'daily' | 'weekly' | 'monthly';
    time?: string;
    day_of_week?: string;
    day_of_month?: number;
  };
  additional_conditions?: TriggerCondition[];
  condition_logic?: ConditionLogic;
}

// Count Based Trigger Config
export interface CountBasedTriggerConfig {
  filter_conditions: TriggerCondition[];
  threshold_operator: 'greater_than' | 'less_than' | 'equals' | 'between';
  threshold_value: number;
  threshold_max?: number;
  check_frequency: 'realtime' | '15min' | 'hourly' | 'daily';
}

// Saved Filter Trigger Config
export interface SavedFilterTriggerConfig {
  saved_filter_id: string;
  condition: 'count_above' | 'count_below' | 'count_changes_by' | 'record_added' | 'record_removed';
  threshold?: number;
  check_frequency: 'realtime' | '15min' | 'hourly' | 'daily';
}

export type TriggerConfig = 
  | FieldChangeTriggerConfig 
  | TimeBasedTriggerConfig 
  | CountBasedTriggerConfig 
  | SavedFilterTriggerConfig;

// Trigger Condition for filter-like logic
export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' | 'before' | 'after';
  value: string | number | boolean | null;
}

// Action Configurations
export interface CreateTaskActionConfig {
  title: string;
  description?: string;
  type: string;
  priority: string;
  assigned_to_type: 'trigger.assigned_to' | 'trigger.created_by' | 'specific_user';
  assigned_to_user?: string;
  due_date_type: 'today' | 'tomorrow' | 'relative' | 'absolute';
  due_date_offset?: number;
  due_date_offset_unit?: 'hours' | 'days' | 'weeks';
  due_date_absolute?: string;
  due_time_type: 'current' | 'relative' | 'specific';
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
  reminder_datetime_type: 'relative' | 'absolute';
  reminder_offset?: number;
  reminder_offset_unit?: 'hours' | 'days';
  reminder_datetime_absolute?: string;
  assigned_to_type: 'trigger.assigned_to' | 'trigger.created_by' | 'specific_user';
  assigned_to_user?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
}

export interface SendNotificationActionConfig {
  notification_type: 'in_app' | 'email' | 'sms' | 'all';
  recipients: string[];
  title: string;
  message: string;
  priority?: NotificationPriority;
  include_link?: boolean;
}

export interface SendMessageActionConfig {
  recipient_type: 'trigger.assigned_to' | 'trigger.created_by' | 'specific_user' | 'all_managers';
  specific_user_id?: string;
  message: string;
  include_record_link?: boolean;
}

export interface UpdateFieldActionConfig {
  target: 'trigger_record' | 'related_record';
  related_entity_type?: EntityType;
  field: string;
  value: string | number | boolean;
  operation?: 'set' | 'increment' | 'decrement' | 'append';
}

export interface SendEmailActionConfig {
  template_id?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments?: string[];
  send_timing: 'immediately' | 'delayed' | 'scheduled';
  delay_hours?: number;
  scheduled_datetime?: string;
}

export interface ExecuteWebhookActionConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'GET';
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
  retry_logic: 'none' | 'retry_3' | 'retry_5';
  error_handling: 'ignore' | 'stop' | 'notify';
}

export interface TriggerAutomationActionConfig {
  target_rule_id: string;
  pass_variables?: boolean;
}

export interface AutomationAction {
  id: string;
  type: ActionType;
  config: CreateTaskActionConfig | CreateReminderActionConfig | SendNotificationActionConfig | SendMessageActionConfig | UpdateFieldActionConfig | SendEmailActionConfig | ExecuteWebhookActionConfig | TriggerAutomationActionConfig;
  condition?: TriggerCondition;
  delay_minutes?: number;
  order: number;
}

// Main Automation Rule Type
export interface AutomationRule {
  id: string;
  entity_type: EntityType;
  rule_name: string;
  description?: string;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  actions: AutomationAction[];
  is_active: boolean;
  execution_limit: ExecutionLimit;
  max_executions?: number;
  active_days: string[];
  active_time_start?: string;
  active_time_end?: string;
  execution_order: number;
  exclude_conditions?: TriggerCondition[];
  created_by: string;
  created_at: string;
  updated_at: string;
  last_triggered?: string;
}

// Automation Execution Log
export interface ExecutionLogEntry {
  timestamp: string;
  action_index: number;
  action_type: ActionType;
  status: 'success' | 'failed' | 'skipped';
  details?: string;
  error?: string;
  created_record_id?: string;
}

export interface AutomationExecution {
  id: string;
  rule_id: string;
  entity_type: EntityType;
  entity_id: string;
  trigger_timestamp: string;
  status: ExecutionStatus;
  actions_attempted: number;
  actions_succeeded: number;
  actions_failed: number;
  execution_duration_ms?: number;
  execution_log: ExecutionLogEntry[];
  error_details?: string;
  created_by: string;
}

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

// Automation Template
export interface AutomationTemplate {
  id: string;
  template_name: string;
  description?: string;
  entity_type: EntityType;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  actions: AutomationAction[];
  is_system: boolean;
  created_at: string;
}

// Saved Filter Monitoring
export interface SavedFilterMonitoring {
  id: string;
  filter_id: string;
  current_count: number;
  previous_count: number;
  last_checked?: string;
  last_count_change?: string;
  count_trend: 'increasing' | 'decreasing' | 'stable';
  has_active_triggers: boolean;
  created_at: string;
  updated_at: string;
}

// Automation Settings
export interface AutomationSettings {
  global_enabled: boolean;
  max_rules_per_entity: number;
  default_check_frequency_minutes: number;
  log_retention_days: number;
  max_actions_per_rule: number;
  action_timeout_seconds: number;
  enable_webhook_actions: boolean;
  webhook_timeout_seconds: number;
  enable_chained_automations: boolean;
  max_chain_depth: number;
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  rate_limiting: {
    enabled: boolean;
    max_per_hour: number;
  };
}

// Entity Field Definition for dynamic forms
export interface EntityField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'boolean' | 'array' | 'json';
  options?: { value: string; label: string }[];
  required?: boolean;
  editable?: boolean;
}

// Variable for template interpolation
export interface TemplateVariable {
  name: string;
  label: string;
  category: 'trigger' | 'related' | 'datetime' | 'system';
  example?: string;
}
