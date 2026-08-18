CREATE OR REPLACE FUNCTION public.get_attendance_retention_candidates(p_staff_id uuid DEFAULT NULL)
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can review attendance retention data';
  END IF;

  RETURN QUERY
  SELECT ar.id, ar.staff_id, COALESCE(p.full_name, 'Unknown staff member'), ar.date,
         'photos'::text, ARRAY_REMOVE(ARRAY[ar.clock_in_photo_url, ar.clock_out_photo_url], NULL), hs.photo_retention_days
  FROM public.attendance_records ar
  JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
  LEFT JOIN public.profiles p ON p.id = ar.staff_id
  WHERE (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
    AND ar.date < CURRENT_DATE - hs.photo_retention_days
    AND (ar.clock_in_photo_url IS NOT NULL OR ar.clock_out_photo_url IS NOT NULL)

  UNION ALL

  SELECT ar.id, ar.staff_id, COALESCE(p.full_name, 'Unknown staff member'), ar.date,
         'location'::text, ARRAY[]::text[], hs.location_retention_days
  FROM public.attendance_records ar
  JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
  LEFT JOIN public.profiles p ON p.id = ar.staff_id
  WHERE (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
    AND ar.date < CURRENT_DATE - hs.location_retention_days
    AND (ar.clock_in_latitude IS NOT NULL OR ar.clock_in_longitude IS NOT NULL OR ar.clock_out_latitude IS NOT NULL OR ar.clock_out_longitude IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_attendance_retention_data(p_record_ids uuid[], p_data_type text)
RETURNS TABLE(record_id uuid, clock_in_photo_url text, clock_out_photo_url text)
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
    WITH eligible AS (
      SELECT ar.id, ar.clock_in_photo_url AS in_path, ar.clock_out_photo_url AS out_path
      FROM public.attendance_records ar
      JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
      WHERE ar.id = ANY(p_record_ids)
        AND ar.date < CURRENT_DATE - hs.photo_retention_days
        AND (ar.clock_in_photo_url IS NOT NULL OR ar.clock_out_photo_url IS NOT NULL)
    ), cleared AS (
      UPDATE public.attendance_records ar
      SET clock_in_photo_url = NULL, clock_out_photo_url = NULL
      FROM eligible e
      WHERE ar.id = e.id
      RETURNING ar.id
    )
    SELECT e.id, e.in_path, e.out_path FROM eligible e JOIN cleared c ON c.id = e.id;
  ELSE
    RETURN QUERY
    WITH eligible AS (
      SELECT ar.id, ar.clock_in_photo_url AS in_path, ar.clock_out_photo_url AS out_path
      FROM public.attendance_records ar
      JOIN public.staff_hr_settings hs ON hs.staff_id = ar.staff_id
      WHERE ar.id = ANY(p_record_ids)
        AND ar.date < CURRENT_DATE - hs.location_retention_days
        AND (ar.clock_in_latitude IS NOT NULL OR ar.clock_in_longitude IS NOT NULL OR ar.clock_out_latitude IS NOT NULL OR ar.clock_out_longitude IS NOT NULL)
    ), cleared AS (
      UPDATE public.attendance_records ar
      SET clock_in_latitude = NULL, clock_in_longitude = NULL,
          clock_out_latitude = NULL, clock_out_longitude = NULL
      FROM eligible e
      WHERE ar.id = e.id
      RETURNING ar.id
    )
    SELECT e.id, e.in_path, e.out_path FROM eligible e JOIN cleared c ON c.id = e.id;
  END IF;
END;
$$;