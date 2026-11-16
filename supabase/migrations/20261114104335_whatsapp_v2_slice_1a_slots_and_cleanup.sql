-- ============================================================================
-- Migration Slice 1A: Seed Default Company Slots, Drop Legacy Columns,
-- Harden whatsapp_settings_public (C5), Add Janitor Staging RPC (I4),
-- and Fix Immutable Function search_path Warnings.
-- ============================================================================
BEGIN;

INSERT INTO public.whatsapp_sessions (
  slot, session_key, label, status, desired_state, created_by
)
VALUES
  ('main', 'main', 'Official Main WhatsApp', 'disconnected', 'disconnected', 'system'),
  ('bulk', 'bulk', 'Company Bulk WhatsApp', 'disconnected', 'disconnected', 'system')
ON CONFLICT (session_key) DO NOTHING;

UPDATE public.whatsapp_settings s
SET main_session_id = COALESCE(s.main_session_id, (SELECT id FROM public.whatsapp_sessions WHERE slot = 'main' LIMIT 1)),
    bulk_session_id = COALESCE(s.bulk_session_id, (SELECT id FROM public.whatsapp_sessions WHERE slot = 'bulk' LIMIT 1)),
    updated_at = now();

ALTER TABLE public.whatsapp_settings
  DROP COLUMN IF EXISTS evolution_api_url,
  DROP COLUMN IF EXISTS bulk_instance_name;

ALTER VIEW public.whatsapp_settings_public SET (security_invoker = true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.whatsapp_settings_public
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.whatsapp_settings TO authenticated;

DROP POLICY IF EXISTS whatsapp_settings_authenticated_select ON public.whatsapp_settings;
CREATE POLICY whatsapp_settings_authenticated_select
  ON public.whatsapp_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Active queue references always protect staged files, including files older than 24h.
-- Finalized references and unreferenced >24h orphans are eligible for cleanup.
CREATE OR REPLACE FUNCTION public.wa_staging_cleanup_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'crm-attachments'
     AND o.name LIKE 'whatsapp-staging/%'
     AND NOT EXISTS (
           SELECT 1
             FROM public.whatsapp_queue q
            WHERE q.media_ref ->> 'path' = o.name
              AND q.status NOT IN ('sent', 'failed', 'cancelled', 'skipped_opt_out', 'skipped_invalid')
         )
     AND (
           o.created_at < now() - interval '24 hours'
        OR EXISTS (
             SELECT 1
               FROM public.whatsapp_queue q
              WHERE q.media_ref ->> 'path' = o.name
           )
         )
   ORDER BY o.created_at ASC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

REVOKE ALL ON FUNCTION public.wa_staging_cleanup_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_staging_cleanup_candidates(integer) TO service_role;

ALTER FUNCTION public.normalize_phone_10(text) SET search_path = public;
ALTER FUNCTION public.wa_is_valid_attribution_name(text) SET search_path = public;
ALTER FUNCTION public.wa_is_valid_media_ref(jsonb) SET search_path = public;

COMMIT;
