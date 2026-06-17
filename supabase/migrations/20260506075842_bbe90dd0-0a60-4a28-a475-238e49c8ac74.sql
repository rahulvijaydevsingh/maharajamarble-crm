UPDATE public.automation_rules
SET trigger_config = jsonb_set(
  trigger_config,
  '{conditions,0,triggerConfig,value}',
  '"pending_lost"'::jsonb
),
updated_at = now()
WHERE id = 'f824a0f5-9acd-41df-b9d6-40e038f98c0d';