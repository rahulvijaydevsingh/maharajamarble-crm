-- Index to speed up profile lookups by full_name (used by automation engine)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles(full_name);

-- Data migration: convert existing created_by email values to full_name
UPDATE public.leads
SET created_by = p.full_name
FROM public.profiles p
WHERE p.email = public.leads.created_by
  AND p.full_name IS NOT NULL
  AND public.leads.created_by LIKE '%@%';

UPDATE public.tasks
SET created_by = p.full_name
FROM public.profiles p
WHERE p.email = public.tasks.created_by
  AND p.full_name IS NOT NULL
  AND public.tasks.created_by LIKE '%@%';

UPDATE public.customers
SET created_by = p.full_name
FROM public.profiles p
WHERE p.email = public.customers.created_by
  AND p.full_name IS NOT NULL
  AND public.customers.created_by LIKE '%@%';

UPDATE public.quotations
SET created_by = p.full_name
FROM public.profiles p
WHERE p.email = public.quotations.created_by
  AND p.full_name IS NOT NULL
  AND public.quotations.created_by LIKE '%@%';