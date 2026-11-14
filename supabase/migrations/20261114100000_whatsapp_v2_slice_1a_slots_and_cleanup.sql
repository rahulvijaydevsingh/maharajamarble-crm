-- ============================================================================
-- Migration Slice 1A: Seed Default Company Slots (main, bulk) & Drop Legacy Columns
-- ============================================================================
BEGIN;

INSERT INTO public.whatsapp_sessions (slot, session_key, label, status, desired_state, created_by)
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

COMMIT;
