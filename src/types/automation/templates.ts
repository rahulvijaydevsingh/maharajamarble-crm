import type { EntityType, TriggerType } from "./core";
import type { AutomationAction } from "./actions";
import type { TriggerConfig } from "./triggers";

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
