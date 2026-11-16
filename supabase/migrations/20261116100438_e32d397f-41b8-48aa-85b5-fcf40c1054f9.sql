CREATE OR REPLACE FUNCTION public.resolve_primary_professional_for_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH professional_lead AS (
    SELECT
      l.id,
      right(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), 10) AS phone_digits
    FROM public.leads AS l
    WHERE l.id = p_lead_id
      AND lower(trim(replace(replace(coalesce(l.designation, ''), ' ', '_'), '-', '_'))) IN (
        'architect', 'interior_designer', 'contractor', 'builder', 'engineer',
        'pmc', 'consultant', 'structural_engineer', 'landscape_architect',
        'site_supervisor', 'real_estate_developer', 'kitchen_maker', 'supplier',
        'vendor', 'partner'
      )
  ), primary_junction_match AS (
    SELECT lp.professional_id
    FROM professional_lead AS l
    JOIN public.lead_professionals AS lp
      ON lp.lead_id = l.id
     AND lp.is_primary_contact = true
    JOIN public.professionals AS p
      ON p.id = lp.professional_id
     AND coalesce(lower(p.status), 'active') = 'active'
    WHERE length(l.phone_digits) = 10
      AND right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = l.phone_digits
  ), phone_match AS (
    SELECT p.id AS professional_id
    FROM professional_lead AS l
    JOIN public.professionals AS p
      ON coalesce(lower(p.status), 'active') = 'active'
     AND length(l.phone_digits) = 10
     AND right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = l.phone_digits
  ), candidates AS (
    SELECT professional_id FROM primary_junction_match
    UNION
    SELECT professional_id FROM phone_match
  )
  SELECT CASE
    WHEN count(*) = 1 THEN (array_agg(professional_id))[1]
    ELSE NULL
  END
  FROM candidates;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) TO service_role;

WITH eligible_tasks AS (
  SELECT t.id AS task_id, resolved.professional_id
  FROM public.tasks AS t
  JOIN LATERAL (
    SELECT public.resolve_primary_professional_for_lead(t.lead_id) AS professional_id
  ) AS resolved ON resolved.professional_id IS NOT NULL
  WHERE t.lead_id IS NOT NULL
    AND (t.related_entity_type IS NULL OR t.related_entity_type = 'lead')
)
UPDATE public.tasks AS t
SET related_entity_type = 'professional',
    related_entity_id = eligible_tasks.professional_id
FROM eligible_tasks
WHERE t.id = eligible_tasks.task_id
  AND (t.related_entity_type IS NULL OR t.related_entity_type = 'lead');