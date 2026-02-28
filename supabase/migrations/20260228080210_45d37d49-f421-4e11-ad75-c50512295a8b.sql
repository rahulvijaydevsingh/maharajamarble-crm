
ALTER TABLE public.staff_hr_settings
  ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS salary_effective_from DATE,
  ADD COLUMN IF NOT EXISTS gps_mode TEXT NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS camera_required BOOLEAN DEFAULT true;
