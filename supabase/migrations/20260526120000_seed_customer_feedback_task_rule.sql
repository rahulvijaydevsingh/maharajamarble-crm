-- Migration: Seed automation rule — Feedback Collection task on new customer created
-- Safe to re-run: uses INSERT ... WHERE NOT EXISTS guard.
-- NOTE: During bulk data re-import (migration night), temporarily set
--       is_active = false on this rule before import, then re-enable after.
--       Otherwise every re-inserted customer row will spawn a task.

INSERT INTO public.automation_rules (
  entity_type,
  rule_name,
  description,
  trigger_type,
  trigger_config,
  actions,
  is_active,
  execution_limit,
  execution_order,
  created_by,
  active_days
)
SELECT
  'customers',
  'Feedback Collection on New Customer',
  'Creates a Feedback Collection task 7 days after a new customer is added. Fires for both direct creation and lead conversion paths.',
  'field_change',
  '{
    "conditions": [
      {
        "id": "c1",
        "triggerType": "field_change",
        "triggerConfig": {
          "when": "record_created"
        }
      }
    ],
    "condition_logic": "and"
  }'::jsonb,
  '[
    {
      "id": "a1",
      "type": "create_task",
      "order": 0,
      "config": {
        "type": "Feedback Collection",
        "title": "Collect feedback from customer",
        "priority": "Medium",
        "due_date_type": "relative",
        "due_date_offset": 7,
        "due_date_offset_unit": "days",
        "link_to_trigger": true,
        "assigned_to_type": "trigger.assigned_to"
      }
    }
  ]'::jsonb,
  true,
  'once_per_record',
  0,
  'System',
  ARRAY['mon','tue','wed','thu','fri','sat','sun']
WHERE NOT EXISTS (
  SELECT 1 FROM public.automation_rules
  WHERE rule_name = 'Feedback Collection on New Customer'
    AND entity_type = 'customers'
);
