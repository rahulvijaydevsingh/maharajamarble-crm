-- Synchronize professional task visibility with the originating lead.
-- Safe to re-run: populated historical lead_id values are never overwritten.
UPDATE public.tasks AS t
SET lead_id = p.added_via_lead_id
FROM public.professionals AS p
WHERE t.related_entity_type = 'professional'
  AND t.related_entity_id = p.id
  AND t.lead_id IS NULL
  AND p.added_via_lead_id IS NOT NULL;

-- Fast lookup for tasks attached directly to an entity such as a professional.
CREATE INDEX IF NOT EXISTS idx_tasks_related_entity_type_id
  ON public.tasks USING btree (related_entity_type, related_entity_id);

-- Ensure lead-scoped task lookups are indexed (no-op where already present).
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id
  ON public.tasks USING btree (lead_id);
