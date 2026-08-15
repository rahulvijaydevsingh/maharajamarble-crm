ALTER TABLE public.staff_hr_settings
  ADD COLUMN IF NOT EXISTS store_photos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_location boolean NOT NULL DEFAULT true;

UPDATE public.staff_hr_settings
SET photo_retention_days = GREATEST(COALESCE(photo_retention_days, 90), 30),
    location_retention_days = GREATEST(COALESCE(location_retention_days, 30), 30);

ALTER TABLE public.staff_hr_settings
  ALTER COLUMN photo_retention_days SET DEFAULT 90,
  ALTER COLUMN location_retention_days SET DEFAULT 30;

ALTER TABLE public.staff_hr_settings
  DROP CONSTRAINT IF EXISTS staff_hr_settings_photo_retention_days_minimum,
  DROP CONSTRAINT IF EXISTS staff_hr_settings_location_retention_days_minimum;

ALTER TABLE public.staff_hr_settings
  ADD CONSTRAINT staff_hr_settings_photo_retention_days_minimum CHECK (photo_retention_days >= 30),
  ADD CONSTRAINT staff_hr_settings_location_retention_days_minimum CHECK (location_retention_days >= 30);

CREATE OR REPLACE FUNCTION public.clear_attendance_retention_data(
  p_record_ids uuid[],
  p_data_type text
)
RETURNS TABLE (record_id uuid, clock_in_photo_url text, clock_out_photo_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can clear attendance retention data';
  END IF;

  IF p_data_type NOT IN ('photos', 'location') THEN
    RAISE EXCEPTION 'Invalid retention data type';
  END IF;

  IF COALESCE(array_length(p_record_ids, 1), 0) = 0 OR array_length(p_record_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Select between 1 and 500 attendance records';
  END IF;

  IF p_data_type = 'photos' THEN
    RETURN QUERY
    UPDATE public.attendance_records
    SET clock_in_photo_url = NULL,
        clock_out_photo_url = NULL,
        updated_at = now()
    WHERE id = ANY(p_record_ids)
    RETURNING id, attendance_records.clock_in_photo_url, attendance_records.clock_out_photo_url;
  ELSE
    RETURN QUERY
    UPDATE public.attendance_records
    SET clock_in_latitude = NULL,
        clock_in_longitude = NULL,
        clock_out_latitude = NULL,
        clock_out_longitude = NULL,
        updated_at = now()
    WHERE id = ANY(p_record_ids)
    RETURNING id, attendance_records.clock_in_photo_url, attendance_records.clock_out_photo_url;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_attendance_retention_data(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_attendance_retention_data(uuid[], text) TO service_role;