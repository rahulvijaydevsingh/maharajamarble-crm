REVOKE EXECUTE ON FUNCTION public.invoke_backup_worker(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_backup_worker_on_insert() FROM PUBLIC, anon, authenticated;