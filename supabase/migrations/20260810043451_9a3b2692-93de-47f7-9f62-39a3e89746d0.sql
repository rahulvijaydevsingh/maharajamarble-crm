ALTER TABLE public.staff_hr_settings
  ADD COLUMN IF NOT EXISTS photo_retention_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS location_retention_days integer NOT NULL DEFAULT 30;

UPDATE public.staff_hr_settings
SET
  photo_retention_days = COALESCE(photo_retention_days, 90),
  location_retention_days = COALESCE(location_retention_days, 30)
WHERE photo_retention_days IS NULL OR location_retention_days IS NULL;