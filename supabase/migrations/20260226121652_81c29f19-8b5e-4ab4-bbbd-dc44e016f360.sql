
-- Fix the notify_automation_engine() function to use net.http_post instead of extensions.http_post
-- and pass body as jsonb instead of text
CREATE OR REPLACE FUNCTION public.notify_automation_engine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  edge_url text;
  anon_key text;
BEGIN
  edge_url := current_setting('app.settings.supabase_url', true);
  anon_key := current_setting('app.settings.supabase_anon_key', true);

  -- Fallback to hardcoded values if settings not available
  IF edge_url IS NULL OR edge_url = '' THEN
    edge_url := 'https://ehuxwzbdnpyelmtckoac.supabase.co';
  END IF;
  IF anon_key IS NULL OR anon_key = '' THEN
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodXh3emJkbnB5ZWxtdGNrb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzIxMDEsImV4cCI6MjA4NTMwODEwMX0.EavQ5rqIZMvmxILE5Xa6giiH2l3SvmoOdzO9vNDTQ_s';
  END IF;

  payload := jsonb_build_object(
    'entity_type', TG_TABLE_NAME,
    'entity_id', NEW.id::text,
    'operation', TG_OP,
    'new_row', to_jsonb(NEW),
    'old_row', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  -- Use net.http_post (pg_net) with jsonb body instead of extensions.http_post with text
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/run-automations',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the original operation if automation fails
  RAISE WARNING 'Automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Re-create triggers on all relevant tables to ensure they use the fixed function
DROP TRIGGER IF EXISTS automation_trigger ON public.leads;
DROP TRIGGER IF EXISTS automation_trigger ON public.tasks;
DROP TRIGGER IF EXISTS automation_trigger ON public.customers;
DROP TRIGGER IF EXISTS automation_trigger ON public.professionals;
DROP TRIGGER IF EXISTS automation_trigger ON public.staff_activity_log;

CREATE TRIGGER automation_trigger
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger
  AFTER INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger
  AFTER INSERT OR UPDATE ON public.staff_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.notify_automation_engine();
