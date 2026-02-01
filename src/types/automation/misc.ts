import type { EntityType } from "./core";

// Saved Filter Monitoring
export interface SavedFilterMonitoring {
  id: string;
  filter_id: string;
  current_count: number;
  previous_count: number;
  last_checked?: string;
  last_count_change?: string;
  count_trend: "increasing" | "decreasing" | "stable";
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
  type: "text" | "number" | "select" | "date" | "datetime" | "boolean" | "array" | "json";
  options?: { value: string; label: string }[];
  required?: boolean;
  editable?: boolean;
}

// Variable for template interpolation
export interface TemplateVariable {
  name: string;
  label: string;
  category: "trigger" | "related" | "datetime" | "system";
  example?: string;
}