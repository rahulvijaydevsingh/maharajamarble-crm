-- Synchronize professional task visibility with the originating lead.
-- A source lead qualifies only when it represents the professional itself.
-- Safe to re-run: populated historical lead_id values are never overwritten.
UPDATE public.tasks AS t
SET lead_id = p.added_via_lead_id
FROM public.professionals AS p
JOIN public.leads AS l
  ON l.id = p.added_via_lead_id
WHERE t.related_entity_type = 'professional'
  AND t.related_entity_id = p.id
  AND t.lead_id IS NULL
  AND p.added_via_lead_id IS NOT NULL
  AND lower(trim(replace(replace(coalesce(l.designation, ''), ' ', '_'), '-', '_'))) IN (
    'architect', 'interior_designer', 'contractor', 'builder', 'engineer',
    'pmc', 'consultant', 'structural_engineer', 'landscape_architect',
    'site_supervisor', 'real_estate_developer', 'kitchen_maker', 'supplier',
    'vendor', 'partner'
  )
  AND (
    right(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), 10) =
    right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10)
    OR EXISTS (
      SELECT 1
      FROM public.lead_professionals AS lp
      WHERE lp.lead_id = l.id
        AND lp.professional_id = p.id
        AND lp.is_primary_contact = true
    )
  );

-- Fast lookup for tasks attached directly to an entity such as a professional.
CREATE INDEX IF NOT EXISTS idx_tasks_related_entity_type_id
  ON public.tasks USING btree (related_entity_type, related_entity_id);

-- Ensure lead-scoped task lookups are indexed (no-op where already present).
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id
  ON public.tasks USING btree (lead_id);
