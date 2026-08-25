ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS import_method text;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_leads_import_batch_id
  ON public.leads (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_import_batch_id
  ON public.professionals (import_batch_id)
  WHERE import_batch_id IS NOT NULL;