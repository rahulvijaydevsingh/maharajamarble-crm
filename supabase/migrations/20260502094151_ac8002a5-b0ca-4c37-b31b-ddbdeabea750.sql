
-- =====================================================
-- 1. Generalized follow-up sync function
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_followup_dates_on_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_lead_ids uuid[] := ARRAY[]::uuid[];
  affected_customer_ids uuid[] := ARRAY[]::uuid[];
  lid uuid;
  cid uuid;
  latest_completed timestamptz;
  next_pending date;
BEGIN
  -- Collect all potentially affected lead ids from NEW and OLD
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.lead_id IS NOT NULL THEN
      affected_lead_ids := array_append(affected_lead_ids, NEW.lead_id);
    END IF;
    IF NEW.related_entity_type = 'lead' AND NEW.related_entity_id IS NOT NULL THEN
      affected_lead_ids := array_append(affected_lead_ids, NEW.related_entity_id);
    END IF;
    IF NEW.related_entity_type = 'customer' AND NEW.related_entity_id IS NOT NULL THEN
      affected_customer_ids := array_append(affected_customer_ids, NEW.related_entity_id);
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.lead_id IS NOT NULL THEN
      affected_lead_ids := array_append(affected_lead_ids, OLD.lead_id);
    END IF;
    IF OLD.related_entity_type = 'lead' AND OLD.related_entity_id IS NOT NULL THEN
      affected_lead_ids := array_append(affected_lead_ids, OLD.related_entity_id);
    END IF;
    IF OLD.related_entity_type = 'customer' AND OLD.related_entity_id IS NOT NULL THEN
      affected_customer_ids := array_append(affected_customer_ids, OLD.related_entity_id);
    END IF;
  END IF;

  -- Update each affected lead
  FOREACH lid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(affected_lead_ids)))
  LOOP
    SELECT MAX(completed_at) INTO latest_completed
    FROM public.tasks
    WHERE lead_id = lid AND status = 'Completed';

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE lead_id = lid
      AND status IN ('Pending', 'In Progress')
      AND due_date IS NOT NULL;

    UPDATE public.leads
    SET
      last_follow_up = latest_completed,
      next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = lid;
  END LOOP;

  -- Update each affected customer
  FOREACH cid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(affected_customer_ids)))
  LOOP
    SELECT MAX(completed_at) INTO latest_completed
    FROM public.tasks
    WHERE related_entity_type = 'customer'
      AND related_entity_id = cid
      AND status = 'Completed';

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE related_entity_type = 'customer'
      AND related_entity_id = cid
      AND status IN ('Pending', 'In Progress')
      AND due_date IS NOT NULL;

    UPDATE public.customers
    SET
      last_follow_up = latest_completed,
      next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = cid;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_followup_dates_on_task_change failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- 2. Attach trigger to tasks table
-- =====================================================
DROP TRIGGER IF EXISTS trg_sync_followup_dates ON public.tasks;

CREATE TRIGGER trg_sync_followup_dates
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_followup_dates_on_task_change();

-- =====================================================
-- 3. Add tables to supabase_realtime publication
-- =====================================================
DO $$
DECLARE
  t text;
  tables_to_add text[] := ARRAY['tasks','leads','customers','activity_log','reminders'];
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Ensure full row data on UPDATE/DELETE for realtime payloads
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.activity_log REPLICA IDENTITY FULL;
ALTER TABLE public.reminders REPLICA IDENTITY FULL;

-- =====================================================
-- 4. Backfill all current follow-up dates so existing data is correct now
-- =====================================================
UPDATE public.leads l
SET
  last_follow_up = sub.latest_completed,
  next_follow_up = sub.next_pending
FROM (
  SELECT 
    l.id AS lid,
    (SELECT MAX(completed_at) FROM public.tasks WHERE lead_id = l.id AND status = 'Completed') AS latest_completed,
    (SELECT (MIN(due_date))::timestamptz FROM public.tasks WHERE lead_id = l.id AND status IN ('Pending','In Progress') AND due_date IS NOT NULL) AS next_pending
  FROM public.leads l
) sub
WHERE l.id = sub.lid;

UPDATE public.customers c
SET
  last_follow_up = sub.latest_completed,
  next_follow_up = sub.next_pending
FROM (
  SELECT 
    c.id AS cid,
    (SELECT MAX(completed_at) FROM public.tasks WHERE related_entity_type='customer' AND related_entity_id = c.id AND status = 'Completed') AS latest_completed,
    (SELECT (MIN(due_date))::timestamptz FROM public.tasks WHERE related_entity_type='customer' AND related_entity_id = c.id AND status IN ('Pending','In Progress') AND due_date IS NOT NULL) AS next_pending
  FROM public.customers c
) sub
WHERE c.id = sub.cid;
