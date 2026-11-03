-- Attendance retention defaults and missing-settings support.
-- Existing RPC OUT-column names differed between Preview and Production, so
-- introduce a versioned RPC rather than changing an existing function's return type.
ALTER TABLE public.staff_hr_settings
  ALTER COLUMN photo_retention_days SET DEFAULT 60,
  ALTER COLUMN location_retention_days SET DEFAULT 30;

CREATE OR REPLACE FUNCTION public.get_attendance_retention_candidates_v2(p_staff_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  record_id uuid,
  staff_id uuid,
  staff_name text,
  attendance_date date,
  data_type text,
  photo_file_paths text[],
  retention_days integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can review attendance retention data';
  END IF;

  RETURN QUERY
  SELECT
    ar.id,
    ar.staff_id,
    COALESCE(p.full_name, 'Unknown staff member'),
    ar.date,
    'photos'::text,
    ARRAY_REMOVE(ARRAY[ar.clock_in_photo_url, ar.clock_out_photo_url], NULL),
    COALESCE(hs.photo_retention_days, 60)
  FROM public.attendance_records ar
  LEFT JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
  LEFT JOIN public.profiles p ON p.id = ar.staff_id
  WHERE (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
    AND ar.date < CURRENT_DATE - COALESCE(hs.photo_retention_days, 60)
    AND COALESCE(hs.store_photos, true) IS TRUE
    AND (ar.clock_in_photo_url IS NOT NULL OR ar.clock_out_photo_url IS NOT NULL)

  UNION ALL

  SELECT
    ar.id,
    ar.staff_id,
    COALESCE(p.full_name, 'Unknown staff member'),
    ar.date,
    'location'::text,
    ARRAY[]::text[],
    COALESCE(hs.location_retention_days, 30)
  FROM public.attendance_records ar
  LEFT JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
  LEFT JOIN public.profiles p ON p.id = ar.staff_id
  WHERE (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
    AND ar.date < CURRENT_DATE - COALESCE(hs.location_retention_days, 30)
    AND COALESCE(hs.store_location, true) IS TRUE
    AND (
      ar.clock_in_latitude IS NOT NULL OR ar.clock_in_longitude IS NOT NULL OR
      ar.clock_out_latitude IS NOT NULL OR ar.clock_out_longitude IS NOT NULL
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_attendance_retention_candidates_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_retention_candidates_v2(uuid) TO authenticated, service_role;
