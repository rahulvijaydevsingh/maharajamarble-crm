
-- Fix 1: Update the trigger function to use safer date casting that handles DATE type correctly
CREATE OR REPLACE FUNCTION public.update_lead_followup_dates()
RETURNS TRIGGER AS $$
DECLARE
  target_lead_id UUID;
  latest_completed TIMESTAMPTZ;
  next_pending DATE;
BEGIN
  -- Determine which lead to update
  IF TG_TABLE_NAME = 'tasks' THEN
    target_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  END IF;

  IF target_lead_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Get latest completed task date
  SELECT MAX(completed_at) INTO latest_completed
  FROM public.tasks
  WHERE lead_id = target_lead_id
    AND status = 'Completed';

  -- Get earliest pending task due_date (DATE type)
  SELECT MIN(due_date) INTO next_pending
  FROM public.tasks
  WHERE lead_id = target_lead_id
    AND status IN ('Pending', 'In Progress')
    AND due_date IS NOT NULL;

  -- Update lead with safe casting
  UPDATE public.leads
  SET
    last_follow_up = latest_completed,
    next_follow_up = CASE
      WHEN next_pending IS NOT NULL
      THEN next_pending::timestamptz
      ELSE NULL
    END
  WHERE id = target_lead_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Fix 2: Backfill all leads that have pending tasks but show NULL next_follow_up
UPDATE public.leads l
SET next_follow_up = (
  SELECT MIN(t.due_date)::timestamptz
  FROM public.tasks t
  WHERE t.lead_id = l.id
    AND t.status IN ('Pending', 'In Progress')
    AND t.due_date IS NOT NULL
)
WHERE l.status NOT IN ('lost', 'deleted')
  AND l.next_follow_up IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.lead_id = l.id
      AND t.status IN ('Pending', 'In Progress')
      AND t.due_date IS NOT NULL
  );
