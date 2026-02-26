
-- 1. Allow users to view their own staff activity log entries
CREATE POLICY "Users can view own activity"
ON public.staff_activity_log
FOR SELECT
USING (user_id = auth.uid());

-- 2. Enable the pg_net extension (for HTTP calls from triggers)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Create the notify_automation_engine function
CREATE OR REPLACE FUNCTION public.notify_automation_engine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  PERFORM extensions.http_post(
    url := edge_url || '/functions/v1/run-automations',
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the original operation if automation fails
  RAISE WARNING 'Automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Create triggers on key tables
CREATE TRIGGER automation_trigger_staff_activity
  AFTER INSERT ON public.staff_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger_leads
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger_tasks
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger_customers
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_automation_engine();

CREATE TRIGGER automation_trigger_professionals
  AFTER INSERT OR UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_automation_engine();
