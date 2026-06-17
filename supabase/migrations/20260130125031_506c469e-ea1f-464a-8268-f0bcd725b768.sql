-- Add Plus Code field to professionals
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS site_plus_code text;

-- Optional: index for faster filtering/sorting if used frequently
CREATE INDEX IF NOT EXISTS professionals_site_plus_code_idx
ON public.professionals (site_plus_code);

-- Ensure RLS remains enabled (no-op if already)
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;