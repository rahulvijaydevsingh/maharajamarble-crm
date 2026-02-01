import type { EntityType, ExecutionLimit, ExecutionStatus, TriggerType } from "./core";
import type { AutomationAction } from "./actions";
import type { TriggerCondition, TriggerConfig } from "./triggers";

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
  action_type: import("./core").ActionType;
  status: "success" | "failed" | "skipped";
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
