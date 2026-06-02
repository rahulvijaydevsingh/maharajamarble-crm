-- Creates a security-definer RPC that returns all user-created tables
-- in the public schema. Called by the crm-backup-create edge function
-- for dynamic table discovery. No parameters required.
CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_tables() TO service_role;
