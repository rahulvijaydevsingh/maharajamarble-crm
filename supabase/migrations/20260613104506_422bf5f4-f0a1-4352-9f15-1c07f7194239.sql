CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.invoke_backup_worker(job_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_url text := 'https://ehuxwzbdnpyelmtckoac.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodXh3emJkbnB5ZWxtdGNrb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzIxMDEsImV4cCI6MjA4NTMwODEwMX0.EavQ5rqIZMvmxILE5Xa6giiH2l3SvmoOdzO9vNDTQ_s';
BEGIN
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/crm-backup-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || anon_key,
      'apikey', anon_key
    ),
    body := CASE WHEN job_id IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('job_id', job_id) END
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_backup_worker failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_backup_worker_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_backup_worker(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backup_jobs_insert_trigger ON public.backup_jobs;
CREATE TRIGGER backup_jobs_insert_trigger
  AFTER INSERT ON public.backup_jobs
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.trigger_backup_worker_on_insert();

-- Remove any prior schedule of the same name, then schedule the sweeper.
DO $$
BEGIN
  PERFORM cron.unschedule('backup-jobs-sweeper');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'backup-jobs-sweeper',
  '*/2 * * * *',
  $cron$
    SELECT public.invoke_backup_worker(id)
    FROM public.backup_jobs
    WHERE status = 'pending'
       OR (status = 'processing' AND updated_at < now() - interval '3 minutes')
    LIMIT 5;
  $cron$
);