import type { ConditionLogic } from "./core";

// Field Change Trigger Config
export interface FieldChangeTriggerConfig {
  when:
    | "field_changes_to"
    | "field_changes_from_to"
    | "any_field_updated"
    | "record_created"
    | "record_deleted"
    | "field_matches";
  field?: string;
  value?: string | number | boolean;
  from_value?: string | number | boolean;
  to_value?: string | number | boolean;
  operator?:
    | "equals"
    | "not_equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
}

// Trigger Condition for filter-like logic
export interface TriggerCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty"
    | "before"
    | "after";
  value: string | number | boolean | null;
}

// Time Based Trigger Config
export interface TimeBasedTriggerConfig {
  timing_type: "relative_to_field" | "relative_to_creation" | "absolute";
  field?: string;
  offset_value?: number;
  offset_unit?: "minutes" | "hours" | "days" | "weeks" | "months";
  offset_direction?: "before" | "after";
  schedule?: {
    type: "daily" | "weekly" | "monthly";
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
  threshold_operator: "greater_than" | "less_than" | "equals" | "between";
  threshold_value: number;
  threshold_max?: number;
  check_frequency: "realtime" | "15min" | "hourly" | "daily";
}

// Saved Filter Trigger Config
export interface SavedFilterTriggerConfig {
  saved_filter_id: string;
  condition: "count_above" | "count_below" | "count_changes_by" | "record_added" | "record_removed";
  threshold?: number;
  check_frequency: "realtime" | "15min" | "hourly" | "daily";
}

export type TriggerConfig =
  | FieldChangeTriggerConfig
  | TimeBasedTriggerConfig
  | CountBasedTriggerConfig
  | SavedFilterTriggerConfig;
