REVOKE EXECUTE ON FUNCTION public.get_all_staff_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_staff_roles() TO authenticated;