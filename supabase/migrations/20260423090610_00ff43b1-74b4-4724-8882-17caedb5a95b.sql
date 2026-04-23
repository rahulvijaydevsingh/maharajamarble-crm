-- Remove the buggy "Auto In Progress" rule
DELETE FROM public.automation_rules
WHERE id = 'cb47f2d9-ef5d-4eeb-9db7-9ce3f361c0ce';

-- Rule 1: Lead → In-Progress when a linked task is marked Completed
INSERT INTO public.automation_rules (
  rule_name, description, entity_type, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order
) VALUES (
  'Lead → In-Progress on Task Completed',
  'When a task linked to a lead is marked Completed, advance the lead from "new" to "in-progress".',
  'tasks',
  'field_change',
  jsonb_build_object(
    'condition_logic', 'and',
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_matches',
          'field', 'lead_id',
          'operator', 'is_not_empty',
          'value', ''
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_changes_to',
          'field', 'status',
          'operator', 'equals',
          'value', 'Completed'
        )
      )
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'update_field',
      'order', 0,
      'config', jsonb_build_object(
        'target', 'related_record',
        'related_entity_type', 'leads',
        'related_entity_field', 'lead_id',
        'field', 'status',
        'value', 'in-progress',
        'expected_current_value', 'new'
      )
    )
  ),
  true, 'unlimited', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 0
);

-- Rule 2: Lead → In-Progress when a linked task is snoozed
INSERT INTO public.automation_rules (
  rule_name, description, entity_type, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order
) VALUES (
  'Lead → In-Progress on Task Snoozed',
  'When a task linked to a lead is snoozed, advance the lead from "new" to "in-progress".',
  'tasks',
  'field_change',
  jsonb_build_object(
    'condition_logic', 'and',
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_matches',
          'field', 'lead_id',
          'operator', 'is_not_empty',
          'value', ''
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_matches',
          'field', 'snoozed_until',
          'operator', 'is_not_empty',
          'value', ''
        )
      )
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'update_field',
      'order', 0,
      'config', jsonb_build_object(
        'target', 'related_record',
        'related_entity_type', 'leads',
        'related_entity_field', 'lead_id',
        'field', 'status',
        'value', 'in-progress',
        'expected_current_value', 'new'
      )
    )
  ),
  true, 'unlimited', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 1
);

-- Rule 3: Lead → In-Progress when a linked task's due_date is changed (rescheduled)
INSERT INTO public.automation_rules (
  rule_name, description, entity_type, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order
) VALUES (
  'Lead → In-Progress on Task Rescheduled',
  'When a task linked to a lead has its due_date updated, advance the lead from "new" to "in-progress".',
  'tasks',
  'field_change',
  jsonb_build_object(
    'condition_logic', 'and',
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_matches',
          'field', 'lead_id',
          'operator', 'is_not_empty',
          'value', ''
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'any_field_updated',
          'field', 'due_date',
          'operator', 'is_not_empty',
          'value', ''
        )
      )
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'update_field',
      'order', 0,
      'config', jsonb_build_object(
        'target', 'related_record',
        'related_entity_type', 'leads',
        'related_entity_field', 'lead_id',
        'field', 'status',
        'value', 'in-progress',
        'expected_current_value', 'new'
      )
    )
  ),
  true, 'unlimited', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 2
);
