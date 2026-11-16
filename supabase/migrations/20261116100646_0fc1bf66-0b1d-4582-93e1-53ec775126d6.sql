REVOKE EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_primary_professional_for_lead(uuid) TO service_role;