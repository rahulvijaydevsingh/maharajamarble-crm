REVOKE EXECUTE ON FUNCTION public.get_attendance_retention_candidates(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_attendance_retention_data(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_retention_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_attendance_retention_data(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_retention_candidates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_attendance_retention_data(uuid[], text) TO service_role;