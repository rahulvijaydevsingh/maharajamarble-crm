
-- Drop the old CHECK constraint on automation_rules.entity_type
ALTER TABLE public.automation_rules 
  DROP CONSTRAINT IF EXISTS automation_rules_entity_type_check;

-- Add updated CHECK constraint with kit and staff_activity
ALTER TABLE public.automation_rules 
  ADD CONSTRAINT automation_rules_entity_type_check 
  CHECK (entity_type = ANY (ARRAY[
    'leads'::text, 'tasks'::text, 'customers'::text, 'professionals'::text, 
    'quotations'::text, 'kit'::text, 'staff_activity'::text
  ]));
