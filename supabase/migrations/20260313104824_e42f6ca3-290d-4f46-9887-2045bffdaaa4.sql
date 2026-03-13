ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS added_by uuid,
  ADD COLUMN IF NOT EXISTS added_via_lead_id uuid;

-- Add index for quick unverified lookups
CREATE INDEX IF NOT EXISTS idx_professionals_verified ON public.professionals (verified) WHERE verified = false;