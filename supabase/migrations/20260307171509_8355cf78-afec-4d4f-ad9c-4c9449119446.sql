
-- Seed 3 pre-configured automation rules for the Lead Lifecycle system
-- Only insert if they don't already exist (idempotent)

-- RULE 1: Auto In Progress
-- When a task is created/updated on a lead that is still 'new', change lead to 'in_progress'
INSERT INTO automation_rules (
  entity_type, rule_name, description, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order, created_by
)
SELECT 'tasks', 'Auto In Progress', 
  'Automatically moves a lead from New to In Progress when task activity is logged against it',
  'field_change',
  jsonb_build_object(
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'record_created',
          'field', 'lead_id',
          'operator', 'is_not_empty',
          'value', ''
        )
      )
    ),
    'condition_logic', 'and'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'update_field',
      'config', jsonb_build_object(
        'target', 'trigger_record',
        'field', 'status',
        'value', 'in_progress',
        'related_entity_type', 'leads'
      ),
      'order', 0
    )
  ),
  true, 'once_per_record',
  ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  1, 'System'
WHERE NOT EXISTS (SELECT 1 FROM automation_rules WHERE rule_name = 'Auto In Progress');

-- RULE 2: Pending Lost — Manager Approval
-- When lead status changes to pending_lost, reassign tasks and create approval task
INSERT INTO automation_rules (
  entity_type, rule_name, description, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order, created_by
)
SELECT 'leads', 'Pending Lost — Manager Approval',
  'When a lead is marked as Pending Lost, reassign tasks to admin and create an approval task',
  'field_change',
  jsonb_build_object(
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_changes_to',
          'field', 'status',
          'operator', 'equals',
          'value', 'pending_lost'
        )
      )
    ),
    'condition_logic', 'and'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'handle_lead_tasks',
      'config', jsonb_build_object(
        'operation', 'reassign_all',
        'reassign_to_type', 'admin_role',
        'task_note', 'Reassigned: {lead_name} pending Lost approval. Reason: {trigger_reason}'
      ),
      'order', 0
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'create_task',
      'config', jsonb_build_object(
        'title', 'Approve Lost Request: Lead pending review',
        'description', 'A staff member has requested to mark this lead as Lost. Review lead history and approve or reject.',
        'type', 'Other',
        'priority', 'High',
        'assigned_to_type', 'trigger.created_by',
        'due_date_type', 'today',
        'link_to_trigger', true
      ),
      'order', 1
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'send_notification',
      'config', jsonb_build_object(
        'notification_type', 'in_app',
        'recipients', jsonb_build_array('trigger.created_by'),
        'title', 'Lost approval needed',
        'message', 'A lead has been marked as Pending Lost and requires your review.',
        'priority', 'important',
        'include_link', true
      ),
      'order', 2
    )
  ),
  true, 'once_per_record',
  ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  2, 'System'
WHERE NOT EXISTS (SELECT 1 FROM automation_rules WHERE rule_name = 'Pending Lost — Manager Approval');

-- RULE 3: Lost Lead Cooling-Off Reminder
-- Daily check: when lead.status = 'lost' AND cooling_off_due_date = today
INSERT INTO automation_rules (
  entity_type, rule_name, description, trigger_type, trigger_config, actions,
  is_active, execution_limit, active_days, execution_order, created_by
)
SELECT 'leads', 'Lost Lead Cooling-Off Reminder',
  'Creates a re-engagement task when a lost lead cooling-off period expires',
  'field_change',
  jsonb_build_object(
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'triggerType', 'field_change',
        'triggerConfig', jsonb_build_object(
          'when', 'field_matches',
          'field', 'status',
          'operator', 'equals',
          'value', 'lost'
        )
      )
    ),
    'condition_logic', 'and'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'create_task',
      'config', jsonb_build_object(
        'title', 'Re-engagement opportunity',
        'description', 'This lead was lost. The cooling-off period may have passed. Consider reaching out again.',
        'type', 'Follow-up Call',
        'priority', 'Medium',
        'assigned_to_type', 'trigger.assigned_to',
        'due_date_type', 'relative',
        'due_date_offset', 3,
        'due_date_offset_unit', 'days',
        'link_to_trigger', true
      ),
      'order', 0
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'send_notification',
      'config', jsonb_build_object(
        'notification_type', 'in_app',
        'recipients', jsonb_build_array('trigger.assigned_to'),
        'title', 'Re-engagement due',
        'message', 'A lost lead cooling-off period has passed. Consider reaching out again.',
        'priority', 'normal',
        'include_link', true
      ),
      'order', 1
    )
  ),
  true, 'once_per_record',
  ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  3, 'System'
WHERE NOT EXISTS (SELECT 1 FROM automation_rules WHERE rule_name = 'Lost Lead Cooling-Off Reminder');
