
-- 1. Drop the redundant / competing triggers so only one sync path runs per task change.
DROP TRIGGER IF EXISTS trg_sync_followup_dates ON public.tasks;
DROP TRIGGER IF EXISTS update_lead_followup_on_task_insert ON public.tasks;
DROP TRIGGER IF EXISTS update_lead_followup_on_task_update ON public.tasks;
DROP TRIGGER IF EXISTS update_lead_followup_on_task_delete ON public.tasks;

-- 2. Rewrite the sync function to
--    (a) treat snoozes and activity-log follow-ups as valid Last Follow-up events,
--    (b) also sync Professional follow-up dates when the task is linked to a professional.
CREATE OR REPLACE FUNCTION public.sync_followup_dates_on_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_ids uuid[] := ARRAY[]::uuid[];
  customer_ids uuid[] := ARRAY[]::uuid[];
  professional_ids uuid[] := ARRAY[]::uuid[];
  lid uuid;
  cid uuid;
  pid uuid;
  latest timestamptz;
  next_pending date;
  activity_types text[] := ARRAY['call','site_visit','meeting','whatsapp_sent','email_sent','note_added','follow_up_completed','task_snoozed'];
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.lead_id IS NOT NULL THEN lead_ids := array_append(lead_ids, NEW.lead_id); END IF;
    IF NEW.related_entity_type = 'lead' AND NEW.related_entity_id IS NOT NULL THEN lead_ids := array_append(lead_ids, NEW.related_entity_id); END IF;
    IF NEW.related_entity_type = 'customer' AND NEW.related_entity_id IS NOT NULL THEN customer_ids := array_append(customer_ids, NEW.related_entity_id); END IF;
    IF NEW.related_entity_type = 'professional' AND NEW.related_entity_id IS NOT NULL THEN professional_ids := array_append(professional_ids, NEW.related_entity_id); END IF;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.lead_id IS NOT NULL THEN lead_ids := array_append(lead_ids, OLD.lead_id); END IF;
    IF OLD.related_entity_type = 'lead' AND OLD.related_entity_id IS NOT NULL THEN lead_ids := array_append(lead_ids, OLD.related_entity_id); END IF;
    IF OLD.related_entity_type = 'customer' AND OLD.related_entity_id IS NOT NULL THEN customer_ids := array_append(customer_ids, OLD.related_entity_id); END IF;
    IF OLD.related_entity_type = 'professional' AND OLD.related_entity_id IS NOT NULL THEN professional_ids := array_append(professional_ids, OLD.related_entity_id); END IF;
  END IF;

  FOREACH lid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(lead_ids)))
  LOOP
    SELECT GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks
         WHERE (lead_id = lid OR (related_entity_type='lead' AND related_entity_id=lid))
           AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks
         WHERE (lead_id = lid OR (related_entity_type='lead' AND related_entity_id=lid))),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h
         JOIN public.tasks t ON t.id = h.task_id
         WHERE (t.lead_id = lid OR (t.related_entity_type='lead' AND t.related_entity_id=lid))),
      (SELECT MAX(created_at) FROM public.activity_log
         WHERE lead_id = lid AND activity_type = ANY(activity_types))
    ) INTO latest;

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE (lead_id = lid OR (related_entity_type='lead' AND related_entity_id=lid))
      AND lower(status) NOT IN ('completed','cancelled')
      AND completed_at IS NULL
      AND due_date IS NOT NULL;

    UPDATE public.leads
    SET last_follow_up = latest,
        next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = lid;
  END LOOP;

  FOREACH cid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(customer_ids)))
  LOOP
    SELECT GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks
         WHERE related_entity_type='customer' AND related_entity_id=cid AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks
         WHERE related_entity_type='customer' AND related_entity_id=cid),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h
         JOIN public.tasks t ON t.id = h.task_id
         WHERE t.related_entity_type='customer' AND t.related_entity_id=cid)
    ) INTO latest;

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE related_entity_type='customer' AND related_entity_id=cid
      AND lower(status) NOT IN ('completed','cancelled')
      AND completed_at IS NULL
      AND due_date IS NOT NULL;

    UPDATE public.customers
    SET last_follow_up = latest,
        next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = cid;
  END LOOP;

  FOREACH pid IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(professional_ids)))
  LOOP
    SELECT GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks
         WHERE related_entity_type='professional' AND related_entity_id=pid AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks
         WHERE related_entity_type='professional' AND related_entity_id=pid),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h
         JOIN public.tasks t ON t.id = h.task_id
         WHERE t.related_entity_type='professional' AND t.related_entity_id=pid)
    ) INTO latest;

    SELECT MIN(due_date) INTO next_pending
    FROM public.tasks
    WHERE related_entity_type='professional' AND related_entity_id=pid
      AND lower(status) NOT IN ('completed','cancelled')
      AND completed_at IS NULL
      AND due_date IS NOT NULL;

    UPDATE public.professionals
    SET last_follow_up = latest,
        next_follow_up = CASE WHEN next_pending IS NOT NULL THEN next_pending::timestamptz ELSE NULL END
    WHERE id = pid;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_followup_dates_on_task_change failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Backfill: keep lead.address in sync with the newer site_location
--    so the profile page stops showing the stale address value.
UPDATE public.leads
SET address = site_location
WHERE site_location IS NOT NULL
  AND site_location <> ''
  AND COALESCE(address, '') <> site_location;

-- 4. Backfill: link existing tasks on professional-designated leads to the
--    matching Professional record, so those tasks surface on the Professional profile.
UPDATE public.tasks t
SET related_entity_type = 'professional',
    related_entity_id = p.id
FROM public.leads l
JOIN public.professionals p
  ON (regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
      OR regexp_replace(COALESCE(p.alternate_phone,''), '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g'))
WHERE t.lead_id = l.id
  AND l.designation IN ('architect','builder','contractor','interior_designer','site_supervisor','real_estate_developer')
  AND (t.related_entity_type IS NULL OR t.related_entity_type = 'lead');

-- 5. Recompute follow-up dates for every lead / customer / professional now
--    that the trigger logic changed and the linkage backfill ran.
WITH agg AS (
  SELECT l.id AS lead_id,
    GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks WHERE (lead_id=l.id OR (related_entity_type='lead' AND related_entity_id=l.id)) AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks WHERE (lead_id=l.id OR (related_entity_type='lead' AND related_entity_id=l.id))),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h JOIN public.tasks t ON t.id=h.task_id WHERE (t.lead_id=l.id OR (t.related_entity_type='lead' AND t.related_entity_id=l.id))),
      (SELECT MAX(created_at) FROM public.activity_log WHERE lead_id=l.id AND activity_type = ANY(ARRAY['call','site_visit','meeting','whatsapp_sent','email_sent','note_added','follow_up_completed','task_snoozed']))
    ) AS lfu,
    (SELECT MIN(due_date) FROM public.tasks WHERE (lead_id=l.id OR (related_entity_type='lead' AND related_entity_id=l.id)) AND lower(status) NOT IN ('completed','cancelled') AND completed_at IS NULL AND due_date IS NOT NULL) AS nfu
  FROM public.leads l
)
UPDATE public.leads l SET last_follow_up = agg.lfu, next_follow_up = CASE WHEN agg.nfu IS NOT NULL THEN agg.nfu::timestamptz ELSE NULL END
FROM agg WHERE agg.lead_id = l.id;

WITH agg AS (
  SELECT p.id AS pid,
    GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks WHERE related_entity_type='professional' AND related_entity_id=p.id AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks WHERE related_entity_type='professional' AND related_entity_id=p.id),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h JOIN public.tasks t ON t.id=h.task_id WHERE t.related_entity_type='professional' AND t.related_entity_id=p.id)
    ) AS lfu,
    (SELECT MIN(due_date) FROM public.tasks WHERE related_entity_type='professional' AND related_entity_id=p.id AND lower(status) NOT IN ('completed','cancelled') AND completed_at IS NULL AND due_date IS NOT NULL) AS nfu
  FROM public.professionals p
)
UPDATE public.professionals p SET last_follow_up = agg.lfu, next_follow_up = CASE WHEN agg.nfu IS NOT NULL THEN agg.nfu::timestamptz ELSE NULL END
FROM agg WHERE agg.pid = p.id;

WITH agg AS (
  SELECT c.id AS cid,
    GREATEST(
      (SELECT MAX(completed_at) FROM public.tasks WHERE related_entity_type='customer' AND related_entity_id=c.id AND lower(status)='completed'),
      (SELECT MAX(last_attempt_at) FROM public.tasks WHERE related_entity_type='customer' AND related_entity_id=c.id),
      (SELECT MAX(h.created_at) FROM public.task_snooze_history h JOIN public.tasks t ON t.id=h.task_id WHERE t.related_entity_type='customer' AND t.related_entity_id=c.id)
    ) AS lfu,
    (SELECT MIN(due_date) FROM public.tasks WHERE related_entity_type='customer' AND related_entity_id=c.id AND lower(status) NOT IN ('completed','cancelled') AND completed_at IS NULL AND due_date IS NOT NULL) AS nfu
  FROM public.customers c
)
UPDATE public.customers c SET last_follow_up = agg.lfu, next_follow_up = CASE WHEN agg.nfu IS NOT NULL THEN agg.nfu::timestamptz ELSE NULL END
FROM agg WHERE agg.cid = c.id;
