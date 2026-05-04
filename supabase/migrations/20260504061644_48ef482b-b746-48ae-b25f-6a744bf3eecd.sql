
-- 1. Normalize legacy lowercase status values
UPDATE public.tasks SET status = 'In Progress' WHERE status = 'in_progress';
UPDATE public.tasks SET status = 'Pending' WHERE status = 'pending';
UPDATE public.tasks SET status = 'Completed' WHERE status = 'completed';
UPDATE public.tasks SET status = 'Cancelled' WHERE status = 'cancelled';
UPDATE public.tasks SET status = 'Overdue' WHERE status = 'overdue';

-- 2. Rewrite sync function: case-insensitive + include any non-finished task with a due_date
CREATE OR REPLACE FUNCTION public.sync_followup_dates_on_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_lead_ids uuid[] := ARRAY[]::uuid[];
  affected_customer_ids uuid[] := ARRAY[]::uuid[];
  lid uuid;
  cid uuid;
  latest_completed timestamptz;
  next_pending date;
BEGIN
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

  FOREACH lid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(affected_lead_ids)))
  LOOP
    SELECT MAX(completed_at) INTO latest_completed
    FROM public.tasks
    WHERE (lead_id = lid OR (related_entity_type = 'lead' AND related_entity_id = lid))
      AND lower(status) = 'completed';

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE (lead_id = lid OR (related_entity_type = 'lead' AND related_entity_id = lid))
      AND lower(status) NOT IN ('completed', 'cancelled')
      AND completed_at IS NULL
      AND due_date IS NOT NULL;

    UPDATE public.leads
    SET
      last_follow_up = latest_completed,
      next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = lid;
  END LOOP;

  FOREACH cid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(affected_customer_ids)))
  LOOP
    SELECT MAX(completed_at) INTO latest_completed
    FROM public.tasks
    WHERE related_entity_type = 'customer'
      AND related_entity_id = cid
      AND lower(status) = 'completed';

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE related_entity_type = 'customer'
      AND related_entity_id = cid
      AND lower(status) NOT IN ('completed', 'cancelled')
      AND completed_at IS NULL
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
$function$;

-- 3. Install the trigger
DROP TRIGGER IF EXISTS trg_sync_followup_dates ON public.tasks;
CREATE TRIGGER trg_sync_followup_dates
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_followup_dates_on_task_change();

-- 4. Backfill all leads
WITH lead_stats AS (
  SELECT
    COALESCE(t.lead_id, CASE WHEN t.related_entity_type='lead' THEN t.related_entity_id END) AS lid,
    MAX(CASE WHEN lower(t.status)='completed' THEN t.completed_at END) AS last_done,
    MIN(CASE WHEN lower(t.status) NOT IN ('completed','cancelled') AND t.completed_at IS NULL AND t.due_date IS NOT NULL THEN t.due_date END) AS next_due
  FROM public.tasks t
  WHERE t.lead_id IS NOT NULL OR t.related_entity_type='lead'
  GROUP BY 1
)
UPDATE public.leads l
SET last_follow_up = ls.last_done,
    next_follow_up = CASE WHEN ls.next_due IS NOT NULL THEN ls.next_due::timestamptz ELSE NULL END
FROM lead_stats ls
WHERE ls.lid = l.id;

-- 5. Backfill all customers
WITH cust_stats AS (
  SELECT
    t.related_entity_id AS cid,
    MAX(CASE WHEN lower(t.status)='completed' THEN t.completed_at END) AS last_done,
    MIN(CASE WHEN lower(t.status) NOT IN ('completed','cancelled') AND t.completed_at IS NULL AND t.due_date IS NOT NULL THEN t.due_date END) AS next_due
  FROM public.tasks t
  WHERE t.related_entity_type='customer' AND t.related_entity_id IS NOT NULL
  GROUP BY t.related_entity_id
)
UPDATE public.customers c
SET last_follow_up = cs.last_done,
    next_follow_up = CASE WHEN cs.next_due IS NOT NULL THEN cs.next_due::timestamptz ELSE NULL END
FROM cust_stats cs
WHERE cs.cid = c.id;
