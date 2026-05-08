
UPDATE public.automation_rules
SET actions = jsonb_set(
  actions,
  '{1,config}',
  (actions->1->'config')
    || jsonb_build_object(
      'assigned_to_type', 'specific_user',
      'assigned_to_user', 'Nipun Tantia'
    )
)
WHERE id = 'f824a0f5-9acd-41df-b9d6-40e038f98c0d'
  AND actions->1->>'type' = 'create_task';
