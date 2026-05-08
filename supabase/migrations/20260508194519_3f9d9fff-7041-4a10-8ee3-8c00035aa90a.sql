
-- Attach the existing sync_followup_dates_on_task_change function as a trigger on tasks
DROP TRIGGER IF EXISTS trg_sync_followup_dates_on_task_change ON public.tasks;
CREATE TRIGGER trg_sync_followup_dates_on_task_change
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_followup_dates_on_task_change();

-- Backfill leads
UPDATE public.leads l
SET
  last_follow_up = sub.latest_completed,
  next_follow_up = CASE WHEN sub.next_pending IS NOT NULL THEN sub.next_pending::timestamptz ELSE NULL END
FROM (
  SELECT
    lid AS lead_id,
    MAX(CASE WHEN lower(status) = 'completed' THEN completed_at END) AS latest_completed,
    MIN(CASE WHEN lower(status) NOT IN ('completed', 'cancelled')
         AND completed_at IS NULL
         AND due_date IS NOT NULL THEN due_date END) AS next_pending
  FROM (
    SELECT t.*, COALESCE(t.lead_id, CASE WHEN t.related_entity_type = 'lead' THEN t.related_entity_id END) AS lid
    FROM public.tasks t
  ) x
  WHERE lid IS NOT NULL
  GROUP BY lid
) sub
WHERE l.id = sub.lead_id;

-- Backfill customers
UPDATE public.customers c
SET
  last_follow_up = sub.latest_completed,
  next_follow_up = CASE WHEN sub.next_pending IS NOT NULL THEN sub.next_pending::timestamptz ELSE NULL END
FROM (
  SELECT
    related_entity_id AS customer_id,
    MAX(CASE WHEN lower(status) = 'completed' THEN completed_at END) AS latest_completed,
    MIN(CASE WHEN lower(status) NOT IN ('completed', 'cancelled')
         AND completed_at IS NULL
         AND due_date IS NOT NULL THEN due_date END) AS next_pending
  FROM public.tasks
  WHERE related_entity_type = 'customer' AND related_entity_id IS NOT NULL
  GROUP BY related_entity_id
) sub
WHERE c.id = sub.customer_id;
