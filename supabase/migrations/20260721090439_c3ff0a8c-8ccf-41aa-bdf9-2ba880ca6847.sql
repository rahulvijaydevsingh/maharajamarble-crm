CREATE OR REPLACE FUNCTION public.get_all_staff_roles()
RETURNS TABLE(user_id uuid, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, role FROM public.user_roles;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_staff_roles() TO authenticated;