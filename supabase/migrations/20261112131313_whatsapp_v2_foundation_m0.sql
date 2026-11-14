-- ============================================================================
-- Migration M0: WhatsApp Integration v2 Foundation Schema, RLS & RPCs
-- Spec: docs/superpowers/specs/2026-11-12-whatsapp-integration-v2-design.md
-- Invariants: INVARIANT-01 (No truncation), INVARIANT-04 (Full-name attribution)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Safety Guard: Assert legacy tables are empty before replacement (Sec 7.1)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_sessions_count bigint := 0;
  v_queue_count bigint := 0;
  v_messages_count bigint := 0;
BEGIN
  IF to_regclass('public.whatsapp_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.whatsapp_sessions' INTO v_sessions_count;
  END IF;
  IF to_regclass('public.whatsapp_queue') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.whatsapp_queue' INTO v_queue_count;
  END IF;
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.whatsapp_messages' INTO v_messages_count;
  END IF;

  IF v_sessions_count > 0 OR v_queue_count > 0 OR v_messages_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_ABORTED: whatsapp_sessions (%), whatsapp_queue (%), or whatsapp_messages (%) is not empty',
      v_sessions_count, v_queue_count, v_messages_count;
  END IF;
END $$;

-- Drop dependent views before replacing tables
DROP VIEW IF EXISTS public.whatsapp_campaign_progress;
DROP VIEW IF EXISTS public.whatsapp_settings_public;

-- Drop foreign keys on whatsapp_settings before replacing whatsapp_sessions
ALTER TABLE IF EXISTS public.whatsapp_settings
  DROP CONSTRAINT IF EXISTS whatsapp_settings_main_session_id_fkey,
  DROP CONSTRAINT IF EXISTS whatsapp_settings_bulk_session_id_fkey;

-- Drop dependent foreign keys if re-running on Preview
ALTER TABLE IF EXISTS public.whatsapp_suppressions
  DROP CONSTRAINT IF EXISTS whatsapp_suppressions_source_message_id_fkey;
ALTER TABLE IF EXISTS public.whatsapp_inbound_pool
  DROP CONSTRAINT IF EXISTS whatsapp_inbound_pool_session_id_fkey;
ALTER TABLE IF EXISTS public.whatsapp_events
  DROP CONSTRAINT IF EXISTS whatsapp_events_session_id_fkey;

-- Plain drops (no CASCADE) in dependency order
DROP TABLE IF EXISTS public.whatsapp_messages;
DROP TABLE IF EXISTS public.whatsapp_queue;
DROP TABLE IF EXISTS public.whatsapp_campaigns;
DROP TABLE IF EXISTS public.whatsapp_sessions;

-- ----------------------------------------------------------------------------
-- 1. Core Helper Functions: Phone Normalization, Attribution & Media Validation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone_10(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
  v_candidate text;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN NULL;
  END IF;

  v_digits := regexp_replace(p_raw, '[^0-9]', '', 'g');

  IF length(v_digits) = 10 THEN
    v_candidate := v_digits;
  ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '0' THEN
    v_candidate := substring(v_digits FROM 2);
  ELSIF length(v_digits) = 12 AND left(v_digits, 2) = '91' THEN
    v_candidate := substring(v_digits FROM 3);
  ELSIF length(v_digits) = 14 AND left(v_digits, 4) = '0091' THEN
    v_candidate := substring(v_digits FROM 5);
  ELSE
    RETURN NULL;
  END IF;

  IF v_candidate !~ '^[6-9][0-9]{9}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_is_valid_attribution_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_name IS NOT NULL
    AND btrim(p_name) <> ''
    AND btrim(p_name) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND position('@' IN p_name) = 0;
$$;

CREATE OR REPLACE FUNCTION public.wa_is_valid_media_ref(p_media jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_media IS NULL
    OR jsonb_typeof(p_media) = 'null'
    OR (p_media->>'path') IS NULL
    OR (p_media->>'path') LIKE 'whatsapp-staging/%'
    OR (p_media->>'path') LIKE 'whatsapp-library/%';
$$;

CREATE OR REPLACE FUNCTION public.wa_current_user_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NAME_MISSING: Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT btrim(p.full_name)
    INTO v_name
    FROM public.profiles p
   WHERE (to_jsonb(p)->>'id') = v_uid::text
      OR (to_jsonb(p)->>'user_id') = v_uid::text
   LIMIT 1;

  IF v_name IS NULL OR v_name = '' OR NOT public.wa_is_valid_attribution_name(v_name) THEN
    RAISE EXCEPTION 'PROFILE_NAME_MISSING: profiles.full_name must be a valid non-empty full name (never email or UUID)'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_name;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Tables (Sec 7.3)
-- ----------------------------------------------------------------------------

-- 2.1 whatsapp_sessions
CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL CHECK (slot IN ('main', 'bulk', 'personal')),
  session_key text NOT NULL UNIQUE,
  owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text NULL,
  label text NULL,
  phone_number text NULL,
  wa_jid text NULL,
  push_name text NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (
    status IN (
      'disconnected',
      'pairing_requested',
      'awaiting_qr',
      'connecting',
      'connected',
      'reconnecting',
      'logged_out',
      'paused_safety',
      'error'
    )
  ),
  desired_state text NOT NULL DEFAULT 'disconnected' CHECK (
    desired_state IN ('connected', 'disconnected', 'logged_out')
  ),
  qr_payload text NULL,
  qr_updated_at timestamptz NULL,
  qr_expires_at timestamptz NULL,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text NULL,
  paused_at timestamptz NULL,
  last_disconnect_code integer NULL,
  last_disconnect_reason text NULL,
  last_disconnect_at timestamptz NULL,
  connected_at timestamptz NULL,
  last_active_at timestamptz NULL,
  warmup_started_at timestamptz NULL,
  daily_cap_override integer NULL CHECK (daily_cap_override IS NULL OR (daily_cap_override > 0 AND daily_cap_override <= 200)),
  worker_instance_id text NULL,
  created_by text NOT NULL DEFAULT 'system' CHECK (public.wa_is_valid_attribution_name(created_by)),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_sessions_personal_owner_check CHECK (
    (slot <> 'personal') OR (owner_user_id IS NOT NULL AND public.wa_is_valid_attribution_name(owner_name))
  )
);

CREATE UNIQUE INDEX whatsapp_sessions_company_slot_uidx
  ON public.whatsapp_sessions (slot)
  WHERE slot IN ('main', 'bulk');

CREATE UNIQUE INDEX whatsapp_sessions_personal_owner_uidx
  ON public.whatsapp_sessions (owner_user_id)
  WHERE slot = 'personal';

-- 2.2 Extend whatsapp_settings (Keep legacy evolution_api_url & bulk_instance_name until Slice 1A UI update)
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS evolution_api_url text NULL,
  ADD COLUMN IF NOT EXISTS bulk_instance_name text NULL,
  ADD COLUMN IF NOT EXISTS kill_switch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bulk_session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_shared_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pace_min_seconds integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS pace_max_seconds integer NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS business_hours_start time NOT NULL DEFAULT '09:30:00',
  ADD COLUMN IF NOT EXISTS business_hours_end time NOT NULL DEFAULT '18:30:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS bulk_business_hours_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS main_business_hours_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_new_recipient_cap integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS bulk_new_recipient_cap integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS personal_daily_limit integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS personal_new_recipient_cap integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS warmup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_consecutive_failures integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_media_mb integer NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS bulk_max_recipients integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS staging_quota_mb integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS library_quota_mb integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS gateway_offline_after_seconds integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS opt_out_keywords text[] NOT NULL DEFAULT ARRAY['STOP', 'UNSUBSCRIBE'],
  ADD COLUMN IF NOT EXISTS opt_out_confirmation_text text NOT NULL DEFAULT 'You have been unsubscribed and will not receive further WhatsApp messages from us.',
  ADD COLUMN IF NOT EXISTS inbound_logging_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_pool_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_numbers_before_bulk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interactive_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS showroom_name text NULL,
  ADD COLUMN IF NOT EXISTS showroom_address text NULL,
  ADD COLUMN IF NOT EXISTS showroom_lat numeric NULL,
  ADD COLUMN IF NOT EXISTS showroom_lng numeric NULL,
  ADD COLUMN IF NOT EXISTS showroom_maps_url text NULL,
  ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_settings
  DROP CONSTRAINT IF EXISTS whatsapp_settings_pace_bounds_check,
  DROP CONSTRAINT IF EXISTS whatsapp_settings_max_media_mb_check,
  DROP CONSTRAINT IF EXISTS whatsapp_settings_bulk_max_recipients_check,
  DROP CONSTRAINT IF EXISTS whatsapp_settings_updated_by_check;

ALTER TABLE public.whatsapp_settings
  ADD CONSTRAINT whatsapp_settings_pace_bounds_check CHECK (
    pace_min_seconds >= 5 AND pace_min_seconds <= pace_max_seconds AND pace_max_seconds <= 300
  ),
  ADD CONSTRAINT whatsapp_settings_max_media_mb_check CHECK (
    max_media_mb >= 1 AND max_media_mb <= 50
  ),
  ADD CONSTRAINT whatsapp_settings_bulk_max_recipients_check CHECK (
    bulk_max_recipients >= 1 AND bulk_max_recipients <= 100
  ),
  ADD CONSTRAINT whatsapp_settings_updated_by_check CHECK (
    public.wa_is_valid_attribution_name(updated_by)
  );

INSERT INTO public.whatsapp_settings (id, module_enabled, daily_limit_main, daily_limit_bulk, updated_by)
SELECT gen_random_uuid(), false, 60, 100, 'system'
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_settings);

UPDATE public.whatsapp_settings
   SET daily_limit_main = 60,
       daily_limit_bulk = 100,
       updated_by = COALESCE(NULLIF(btrim(updated_by), ''), 'system'),
       updated_at = now();

-- 2.3 whatsapp_user_permissions
CREATE TABLE IF NOT EXISTS public.whatsapp_user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_use_main_whatsapp boolean NOT NULL DEFAULT false,
  can_use_bulk_whatsapp boolean NOT NULL DEFAULT false,
  can_connect_own_qr boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL DEFAULT 'system' CHECK (public.wa_is_valid_attribution_name(updated_by)),
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2.4 whatsapp_campaigns
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('single', 'bulk')),
  slot text NOT NULL CHECK (slot IN ('main', 'bulk', 'personal')),
  session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  title text NULL,
  template_body text NULL,
  media_ref jsonb NULL CHECK (public.wa_is_valid_media_ref(media_ref)),
  location jsonb NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (
    source IN ('manual', 'quotation', 'automation', 'auto_reply', 'opt_out_confirm')
  ),
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'running', 'paused', 'paused_safety', 'completed', 'cancelled')
  ),
  total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  scheduled_start_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  estimated_duration_seconds integer NOT NULL DEFAULT 0,
  preview_hash text NULL,
  requested_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(requested_by)),
  requested_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by text NULL CHECK (cancelled_by IS NULL OR public.wa_is_valid_attribution_name(cancelled_by)),
  cancel_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2.5 whatsapp_queue
CREATE TABLE public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  slot text NOT NULL CHECK (slot IN ('main', 'bulk', 'personal')),
  recipient_phone text NOT NULL,
  recipient_phone10 text NULL,
  recipient_jid text NULL,
  recipient_name text NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  professional_id uuid NULL REFERENCES public.professionals(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (
    message_type IN ('text', 'media', 'location', 'interactive')
  ),
  rendered_body text NULL,
  placeholder_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_ref jsonb NULL CHECK (public.wa_is_valid_media_ref(media_ref)),
  location jsonb NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (
    source IN ('manual', 'quotation', 'automation', 'auto_reply', 'opt_out_confirm')
  ),
  priority smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),
  is_bulk boolean NOT NULL DEFAULT false,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'sending',
      'sent',
      'failed',
      'cancelled',
      'skipped_opt_out',
      'skipped_invalid',
      'needs_review'
    )
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  error_code text NULL,
  last_error text NULL,
  claimed_by text NULL,
  claim_attempt_id uuid NULL,
  claimed_at timestamptz NULL,
  lease_expires_at timestamptz NULL,
  provider_message_id text NULL,
  sent_at timestamptz NULL,
  delivered_at timestamptz NULL,
  read_at timestamptz NULL,
  failed_at timestamptz NULL,
  processed_at timestamptz NULL,
  requested_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(requested_by)),
  requested_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_queue_single_entity_check CHECK (
    num_nonnulls(lead_id, customer_id, professional_id) <= 1
  ),
  CONSTRAINT whatsapp_queue_requester_uid_check CHECK (
    requested_by_user_id IS NOT NULL
    OR source IN ('auto_reply', 'opt_out_confirm', 'automation')
  )
);

-- 2.6 whatsapp_messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  origin text NOT NULL DEFAULT 'crm' CHECK (
    origin IN ('crm', 'auto_reply', 'system', 'phone_app', 'inbound')
  ),
  queue_id uuid NULL REFERENCES public.whatsapp_queue(id) ON DELETE SET NULL,
  campaign_id uuid NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  sent_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(sent_by)),
  sent_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_e164 text NULL,
  phone10 text NULL,
  jid text NULL,
  lid text NULL,
  contact_push_name text NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  professional_id uuid NULL REFERENCES public.professionals(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (
    message_type IN (
      'text',
      'image',
      'document',
      'catalogue',
      'location',
      'audio',
      'video',
      'sticker',
      'contact',
      'interactive',
      'other'
    )
  ),
  body text NULL CHECK (body IS NULL OR char_length(body) <= 4096),
  media jsonb NULL CHECK (public.wa_is_valid_media_ref(media)),
  location jsonb NULL,
  related_entity_type text NULL,
  related_entity_id uuid NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (
    status IN ('sent', 'delivered', 'read', 'failed', 'received')
  ),
  provider text NOT NULL DEFAULT 'baileys',
  provider_message_id text NULL,
  error_code text NULL,
  error_message text NULL,
  sent_at timestamptz NULL,
  received_at timestamptz NULL,
  delivered_at timestamptz NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redacted_at timestamptz NULL,
  CONSTRAINT whatsapp_messages_address_present_check CHECK (
    phone_e164 IS NOT NULL OR lid IS NOT NULL
  )
);

-- 2.7 whatsapp_suppressions
CREATE TABLE IF NOT EXISTS public.whatsapp_suppressions (
  phone10 text PRIMARY KEY CHECK (phone10 ~ '^[6-9][0-9]{9}$'),
  reason text NOT NULL CHECK (reason IN ('keyword', 'manual', 'complaint', 'invalid_number')),
  source_message_id uuid NULL,
  matched_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(created_by)),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  lifted_at timestamptz NULL,
  lifted_by text NULL CHECK (lifted_by IS NULL OR public.wa_is_valid_attribution_name(lifted_by)),
  lifted_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  lift_reason text NULL
);

ALTER TABLE public.whatsapp_suppressions
  ADD CONSTRAINT whatsapp_suppressions_source_message_id_fkey
  FOREIGN KEY (source_message_id) REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL;

-- Mirror flags on leads, customers, and professionals (Sec 7.3)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz NULL;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz NULL;

-- 2.8 whatsapp_inbound_pool (Stage 3; inactive until lead_pool_enabled)
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_key text NOT NULL UNIQUE,
  phone_e164 text NULL,
  phone10 text NULL,
  lid text NULL,
  jid text NULL,
  sender_push_name text NULL,
  first_message_text text NULL CHECK (first_message_text IS NULL OR char_length(first_message_text) <= 1000),
  last_message_text text NULL CHECK (last_message_text IS NULL OR char_length(last_message_text) <= 1000),
  message_count integer NOT NULL DEFAULT 1 CHECK (message_count >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted_to_lead', 'ignored')),
  session_id uuid NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  converted_lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  reviewed_by text NULL CHECK (reviewed_by IS NULL OR public.wa_is_valid_attribution_name(reviewed_by)),
  reviewed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_inbound_pool
  ADD CONSTRAINT whatsapp_inbound_pool_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL;

-- 2.9 whatsapp_library_items
CREATE TABLE IF NOT EXISTS public.whatsapp_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('catalogue', 'image', 'document')),
  bucket text NOT NULL DEFAULT 'crm-attachments',
  path text NULL UNIQUE CHECK (path IS NULL OR path LIKE 'whatsapp-library/%'),
  filename text NULL,
  mime text NULL,
  size_bytes bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256 text NULL,
  external_url text NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(created_by)),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_library_items_source_check CHECK (
    path IS NOT NULL OR external_url IS NOT NULL
  )
);

-- 2.10 whatsapp_auto_replies & whatsapp_auto_reply_log (Stage 2; inactive until auto_reply_enabled)
CREATE TABLE IF NOT EXISTS public.whatsapp_auto_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  match_type text NOT NULL CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  keywords text[] NOT NULL CHECK (cardinality(keywords) >= 1),
  reply_kind text NOT NULL CHECK (reply_kind IN ('text', 'location', 'media', 'library_item')),
  reply_text text NULL,
  location jsonb NULL,
  library_item_id uuid NULL REFERENCES public.whatsapp_library_items(id) ON DELETE SET NULL,
  applies_to_slots text[] NOT NULL DEFAULT ARRAY['main'],
  known_contacts_only boolean NOT NULL DEFAULT false,
  cooldown_minutes integer NOT NULL DEFAULT 1440 CHECK (cooldown_minutes >= 0),
  business_hours_only boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  created_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(created_by)),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by text NOT NULL CHECK (public.wa_is_valid_attribution_name(updated_by)),
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_auto_reply_log (
  rule_id uuid NOT NULL REFERENCES public.whatsapp_auto_replies(id) ON DELETE CASCADE,
  phone10 text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, phone10)
);

-- 2.11 whatsapp_worker_instances
CREATE TABLE IF NOT EXISTS public.whatsapp_worker_instances (
  worker_id text PRIMARY KEY,
  app_env text NOT NULL CHECK (app_env IN ('production', 'preview')),
  version text NULL,
  build_sha text NULL,
  host_label text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  rss_mb integer NULL,
  uptime_s integer NULL,
  spool_depth integer NOT NULL DEFAULT 0,
  sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text NULL
);

-- 2.12 whatsapp_events (Operations log, 90-day retention)
CREATE TABLE IF NOT EXISTS public.whatsapp_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  session_id uuid NULL,
  worker_id text NULL,
  code text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.whatsapp_events
  ADD CONSTRAINT whatsapp_events_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. Views (Sec 7.3 & 7.5)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.whatsapp_settings_public
WITH (security_invoker = false)
AS
SELECT
  id,
  module_enabled,
  kill_switch,
  bulk_max_recipients,
  max_media_mb,
  business_hours_start,
  business_hours_end,
  timezone,
  bulk_business_hours_only,
  main_business_hours_only,
  showroom_name,
  showroom_address,
  showroom_lat,
  showroom_lng,
  showroom_maps_url
FROM public.whatsapp_settings;

CREATE OR REPLACE VIEW public.whatsapp_campaign_progress
WITH (security_invoker = true)
AS
SELECT
  c.id AS campaign_id,
  c.kind,
  c.slot,
  c.session_id,
  c.title,
  c.source,
  c.status,
  c.total_count,
  c.scheduled_start_at,
  c.started_at,
  c.finished_at,
  c.estimated_duration_seconds,
  c.requested_by,
  c.requested_by_user_id,
  c.created_at,
  count(q.id) FILTER (WHERE q.status = 'queued')::integer AS count_queued,
  count(q.id) FILTER (WHERE q.status = 'sending')::integer AS count_sending,
  count(q.id) FILTER (WHERE q.status = 'sent')::integer AS count_sent,
  count(q.id) FILTER (WHERE q.status = 'failed')::integer AS count_failed,
  count(q.id) FILTER (WHERE q.status = 'cancelled')::integer AS count_cancelled,
  count(q.id) FILTER (WHERE q.status IN ('skipped_opt_out', 'skipped_invalid'))::integer AS count_skipped,
  count(q.id) FILTER (WHERE q.status = 'needs_review')::integer AS count_needs_review
FROM public.whatsapp_campaigns c
LEFT JOIN public.whatsapp_queue q ON q.campaign_id = c.id
GROUP BY c.id;

-- ----------------------------------------------------------------------------
-- 4. Indexes (Sec 7.4)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wa_queue_claim_candidates
  ON public.whatsapp_queue (session_id, status, priority, scheduled_for, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_wa_queue_campaign_id
  ON public.whatsapp_queue (campaign_id);

CREATE INDEX IF NOT EXISTS idx_wa_queue_recipient_phone10_created
  ON public.whatsapp_queue (recipient_phone10, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_queue_sending_lease
  ON public.whatsapp_queue (status, lease_expires_at)
  WHERE status = 'sending';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_wa_messages_session_provider_msg
  ON public.whatsapp_messages (session_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_phone10_created
  ON public.whatsapp_messages (phone10, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_created
  ON public.whatsapp_messages (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_customer_created
  ON public.whatsapp_messages (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_professional_created
  ON public.whatsapp_messages (professional_id, created_at DESC)
  WHERE professional_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_created_at
  ON public.whatsapp_messages (created_at);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_pool_status_last_received
  ON public.whatsapp_inbound_pool (status, last_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_events_at
  ON public.whatsapp_events (at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_suppressions_active
  ON public.whatsapp_suppressions (phone10)
  WHERE lifted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Capability, Suppression & Entity Matcher Functions (Sec 7.2)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_can(p_capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perm record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT can_use_main_whatsapp, can_use_bulk_whatsapp, can_connect_own_qr
    INTO v_perm
    FROM public.whatsapp_user_permissions
   WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  CASE p_capability
    WHEN 'main' THEN RETURN COALESCE(v_perm.can_use_main_whatsapp, false);
    WHEN 'bulk' THEN RETURN COALESCE(v_perm.can_use_bulk_whatsapp, false);
    WHEN 'own_qr' THEN RETURN COALESCE(v_perm.can_connect_own_qr, false);
    ELSE RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_phone_suppressed(p_phone10 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.whatsapp_suppressions s
     WHERE s.phone10 = public.normalize_phone_10(p_phone10)
       AND s.lifted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.wa_match_entities(p_phone10 text)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  name text,
  assigned_to text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_phone10 text := public.normalize_phone_10(p_phone10);
BEGIN
  IF v_phone10 IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sub.entity_type,
    sub.entity_id,
    sub.name,
    sub.assigned_to,
    sub.updated_at
  FROM (
    -- 1. Customers (primary priority)
    SELECT
      'customer'::text AS entity_type,
      c.id AS entity_id,
      c.name::text AS name,
      c.assigned_to::text AS assigned_to,
      COALESCE(c.updated_at, c.created_at, now()) AS updated_at
    FROM public.customers c
    WHERE public.normalize_phone_10(c.phone) = v_phone10
       OR public.normalize_phone_10(c.alternate_phone) = v_phone10
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(to_jsonb(c)->'additional_contacts') = 'array'
                    THEN to_jsonb(c)->'additional_contacts'
                    ELSE '[]'::jsonb
                  END
                ) AS ac
          WHERE public.normalize_phone_10(ac->>'phone') = v_phone10
             OR public.normalize_phone_10(ac->>'alternatePhone') = v_phone10
             OR public.normalize_phone_10(ac->>'alternate_phone') = v_phone10
       )
    UNION ALL
    -- 2. Leads (excluding soft-deleted rows via deleted_at IS NULL)
    SELECT
      'lead'::text AS entity_type,
      l.id AS entity_id,
      l.name::text AS name,
      l.assigned_to::text AS assigned_to,
      COALESCE(l.updated_at, l.created_at, now()) AS updated_at
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND (
        public.normalize_phone_10(l.phone) = v_phone10
        OR public.normalize_phone_10(l.alternate_phone) = v_phone10
        OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements(
                   CASE
                     WHEN jsonb_typeof(to_jsonb(l)->'additional_contacts') = 'array'
                     THEN to_jsonb(l)->'additional_contacts'
                     ELSE '[]'::jsonb
                   END
                 ) AS ac
           WHERE public.normalize_phone_10(ac->>'phone') = v_phone10
              OR public.normalize_phone_10(ac->>'alternatePhone') = v_phone10
              OR public.normalize_phone_10(ac->>'alternate_phone') = v_phone10
        )
      )
    UNION ALL
    -- 3. Professionals
    SELECT
      'professional'::text AS entity_type,
      p.id AS entity_id,
      p.name::text AS name,
      p.assigned_to::text AS assigned_to,
      COALESCE(p.updated_at, p.created_at, now()) AS updated_at
    FROM public.professionals p
    WHERE public.normalize_phone_10(p.phone) = v_phone10
       OR public.normalize_phone_10(p.alternate_phone) = v_phone10
  ) AS sub
  ORDER BY
    CASE sub.entity_type
      WHEN 'customer' THEN 1
      WHEN 'lead' THEN 2
      WHEN 'professional' THEN 3
      ELSE 4
    END,
    sub.updated_at DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPCs (Sec 7.6)
-- ----------------------------------------------------------------------------

-- 6.1 wa_slot_status()
CREATE OR REPLACE FUNCTION public.wa_slot_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.whatsapp_settings%ROWTYPE;
  v_main public.whatsapp_sessions%ROWTYPE;
  v_bulk public.whatsapp_sessions%ROWTYPE;
  v_personal public.whatsapp_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;

  IF v_settings.main_session_id IS NOT NULL THEN
    SELECT * INTO v_main FROM public.whatsapp_sessions WHERE id = v_settings.main_session_id;
  ELSE
    SELECT * INTO v_main FROM public.whatsapp_sessions WHERE slot = 'main' LIMIT 1;
  END IF;

  IF v_settings.bulk_session_id IS NOT NULL THEN
    SELECT * INTO v_bulk FROM public.whatsapp_sessions WHERE id = v_settings.bulk_session_id;
  ELSE
    SELECT * INTO v_bulk FROM public.whatsapp_sessions WHERE slot = 'bulk' LIMIT 1;
  END IF;

  SELECT * INTO v_personal
    FROM public.whatsapp_sessions
   WHERE slot = 'personal' AND owner_user_id = v_uid
   LIMIT 1;

  RETURN jsonb_build_object(
    'module_enabled', COALESCE(v_settings.module_enabled, false),
    'kill_switch', COALESCE(v_settings.kill_switch, false),
    'allow_shared_slots', COALESCE(v_settings.allow_shared_slots, false),
    'slots', jsonb_build_object(
      'main', jsonb_build_object(
        'slot', 'main',
        'session_id', v_main.id,
        'label', COALESCE(v_main.label, 'Official Main WhatsApp'),
        'status', COALESCE(v_main.status, 'disconnected'),
        'paused', COALESCE(v_main.paused, false),
        'last_connected_at', v_main.connected_at,
        'can_send', public.wa_can('main')
      ),
      'bulk', jsonb_build_object(
        'slot', 'bulk',
        'session_id', v_bulk.id,
        'label', COALESCE(v_bulk.label, 'Company Bulk WhatsApp'),
        'status', COALESCE(v_bulk.status, 'disconnected'),
        'paused', COALESCE(v_bulk.paused, false),
        'last_connected_at', v_bulk.connected_at,
        'can_send', public.wa_can('bulk')
      ),
      'personal', jsonb_build_object(
        'slot', 'personal',
        'session_id', v_personal.id,
        'label', COALESCE(v_personal.label, 'My Personal WhatsApp'),
        'status', COALESCE(v_personal.status, 'disconnected'),
        'paused', COALESCE(v_personal.paused, false),
        'last_connected_at', v_personal.connected_at,
        'can_send', public.wa_can('own_qr')
      )
    )
  );
END;
$$;

-- 6.2 wa_create_campaign(payload jsonb)
CREATE OR REPLACE FUNCTION public.wa_create_campaign(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.whatsapp_settings%ROWTYPE;
  v_session public.whatsapp_sessions%ROWTYPE;
  v_request_id text := btrim(p_payload->>'request_id');
  v_kind text := COALESCE(p_payload->>'kind', 'single');
  v_slot text := COALESCE(p_payload->>'slot', 'main');
  v_source text := COALESCE(p_payload->>'source', 'manual');
  v_caller_uid uuid := COALESCE((p_payload->>'requested_by_user_id')::uuid, auth.uid());
  v_caller_name text := btrim(p_payload->>'requested_by');
  v_rows jsonb := COALESCE(p_payload->'rows', '[]'::jsonb);
  v_row_count integer;
  v_existing_campaign_id uuid;
  v_campaign_id uuid;
  v_scheduled_start timestamptz := COALESCE((p_payload->>'scheduled_start_at')::timestamptz, now());
  v_item jsonb;
  v_idx integer := 0;
  v_phone10 text;
  v_queued_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  IF v_request_id IS NULL OR v_request_id = '' THEN
    RAISE EXCEPTION 'INVALID_REQUEST: request_id is required' USING ERRCODE = 'P0001';
  END IF;

  -- Check idempotent replay first
  SELECT q.campaign_id
    INTO v_existing_campaign_id
    FROM public.whatsapp_queue q
   WHERE q.idempotency_key LIKE (v_request_id || ':%')
   LIMIT 1;

  IF v_existing_campaign_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'campaign_id', v_existing_campaign_id,
      'replayed', true,
      'queued', (SELECT count(*) FROM public.whatsapp_queue WHERE campaign_id = v_existing_campaign_id AND status = 'queued'),
      'skipped', (SELECT count(*) FROM public.whatsapp_queue WHERE campaign_id = v_existing_campaign_id AND status IN ('skipped_opt_out', 'skipped_invalid'))
    );
  END IF;

  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;
  IF NOT COALESCE(v_settings.module_enabled, false) THEN
    RAISE EXCEPTION 'MODULE_DISABLED: WhatsApp module is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_settings.kill_switch, false) THEN
    RAISE EXCEPTION 'KILL_SWITCH: WhatsApp kill switch is active' USING ERRCODE = 'P0001';
  END IF;

  -- Attribution & Authorization verification
  IF v_source IN ('auto_reply', 'opt_out_confirm', 'automation') THEN
    v_caller_name := COALESCE(NULLIF(v_caller_name, ''), 'System Auto-Reply');
  ELSE
    IF v_caller_uid IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: Caller user id required' USING ERRCODE = '42501';
    END IF;
    IF v_caller_name IS NULL OR v_caller_name = '' THEN
      SELECT btrim(p.full_name)
        INTO v_caller_name
        FROM public.profiles p
       WHERE (to_jsonb(p)->>'id') = v_caller_uid::text
          OR (to_jsonb(p)->>'user_id') = v_caller_uid::text
       LIMIT 1;
    END IF;
    IF v_caller_name IS NULL OR v_caller_name = '' OR NOT public.wa_is_valid_attribution_name(v_caller_name) THEN
      RAISE EXCEPTION 'PROFILE_NAME_MISSING: Staff profile full_name is required' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Capability & Slot Resolution
  IF v_slot = 'main' THEN
    IF v_source NOT IN ('auto_reply', 'opt_out_confirm') AND NOT (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_caller_uid AND ur.role IN ('admin', 'super_admin'))
      OR EXISTS (SELECT 1 FROM public.whatsapp_user_permissions up WHERE up.user_id = v_caller_uid AND up.can_use_main_whatsapp)
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: Not permitted to use main WhatsApp slot' USING ERRCODE = '42501';
    END IF;
    IF v_kind = 'bulk' THEN
      RAISE EXCEPTION 'FORBIDDEN: Bulk campaigns are not permitted on main slot' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_session
      FROM public.whatsapp_sessions
     WHERE (v_settings.main_session_id IS NOT NULL AND id = v_settings.main_session_id)
        OR (v_settings.main_session_id IS NULL AND slot = 'main')
     LIMIT 1;
  ELSIF v_slot = 'bulk' THEN
    IF v_source NOT IN ('auto_reply', 'opt_out_confirm') AND NOT (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_caller_uid AND ur.role IN ('admin', 'super_admin'))
      OR EXISTS (SELECT 1 FROM public.whatsapp_user_permissions up WHERE up.user_id = v_caller_uid AND up.can_use_bulk_whatsapp)
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: Not permitted to use bulk WhatsApp slot' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_session
      FROM public.whatsapp_sessions
     WHERE (v_settings.bulk_session_id IS NOT NULL AND id = v_settings.bulk_session_id)
        OR (v_settings.bulk_session_id IS NULL AND slot = 'bulk')
     LIMIT 1;
  ELSIF v_slot = 'personal' THEN
    IF v_kind = 'bulk' THEN
      RAISE EXCEPTION 'FORBIDDEN: Personal sessions are 1:1 only' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_caller_uid AND ur.role IN ('admin', 'super_admin'))
      OR EXISTS (SELECT 1 FROM public.whatsapp_user_permissions up WHERE up.user_id = v_caller_uid AND up.can_connect_own_qr)
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: Not permitted to use personal WhatsApp session' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_session
      FROM public.whatsapp_sessions
     WHERE slot = 'personal' AND owner_user_id = v_caller_uid
     LIMIT 1;
  ELSE
    RAISE EXCEPTION 'INVALID_SLOT: Unknown slot %', v_slot USING ERRCODE = 'P0001';
  END IF;

  IF v_session.id IS NULL OR v_session.status = 'logged_out' THEN
    RAISE EXCEPTION 'SLOT_NOT_MAPPED: Target WhatsApp session is unmapped or logged out' USING ERRCODE = 'P0001';
  END IF;

  v_row_count := jsonb_array_length(v_rows);
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_CAMPAIGN: At least one recipient row is required' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind = 'single' AND v_row_count > 1 THEN
    RAISE EXCEPTION 'TOO_MANY_RECIPIENTS: Single send allows at most 1 recipient' USING ERRCODE = 'P0001';
  END IF;

  IF v_row_count > v_settings.bulk_max_recipients THEN
    RAISE EXCEPTION 'TOO_MANY_RECIPIENTS: Campaign exceeds bulk_max_recipients (% > %)',
      v_row_count, v_settings.bulk_max_recipients USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.whatsapp_campaigns (
    kind,
    slot,
    session_id,
    title,
    template_body,
    media_ref,
    location,
    source,
    status,
    total_count,
    scheduled_start_at,
    estimated_duration_seconds,
    preview_hash,
    requested_by,
    requested_by_user_id
  ) VALUES (
    v_kind,
    v_slot,
    v_session.id,
    p_payload->>'title',
    p_payload->>'template_body',
    p_payload->'media_ref',
    p_payload->'location',
    v_source,
    'running',
    v_row_count,
    v_scheduled_start,
    COALESCE((p_payload->>'estimated_duration_seconds')::integer, v_row_count * 25),
    p_payload->>'preview_hash',
    v_caller_name,
    v_caller_uid
  )
  RETURNING id INTO v_campaign_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rows)
  LOOP
    v_idx := v_idx + 1;
    v_phone10 := public.normalize_phone_10(COALESCE(v_item->>'recipient_phone10', v_item->>'recipient_phone'));

    IF v_phone10 IS NULL THEN
      v_skipped_count := v_skipped_count + 1;
      INSERT INTO public.whatsapp_queue (
        campaign_id, session_id, slot, recipient_phone, recipient_phone10, recipient_name,
        lead_id, customer_id, professional_id, message_type, rendered_body, placeholder_values,
        media_ref, location, source, priority, is_bulk, scheduled_for, status, error_code,
        requested_by, requested_by_user_id, idempotency_key
      ) VALUES (
        v_campaign_id, v_session.id, v_slot, COALESCE(v_item->>'recipient_phone', ''), NULL, v_item->>'recipient_name',
        NULLIF(v_item->>'lead_id', '')::uuid, NULLIF(v_item->>'customer_id', '')::uuid, NULLIF(v_item->>'professional_id', '')::uuid,
        COALESCE(v_item->>'message_type', 'text'), v_item->>'rendered_body', COALESCE(v_item->'placeholder_values', '{}'::jsonb),
        COALESCE(v_item->'media_ref', p_payload->'media_ref'), COALESCE(v_item->'location', p_payload->'location'),
        v_source, COALESCE((v_item->>'priority')::smallint, CASE WHEN v_source IN ('auto_reply', 'opt_out_confirm') THEN 2 ELSE 5 END),
        (v_kind = 'bulk'), v_scheduled_start, 'skipped_invalid', 'PHONE_INVALID',
        v_caller_name, v_caller_uid, v_request_id || ':' || v_idx::text
      );
    ELSIF v_source <> 'opt_out_confirm' AND public.wa_phone_suppressed(v_phone10) THEN
      v_skipped_count := v_skipped_count + 1;
      INSERT INTO public.whatsapp_queue (
        campaign_id, session_id, slot, recipient_phone, recipient_phone10, recipient_name,
        lead_id, customer_id, professional_id, message_type, rendered_body, placeholder_values,
        media_ref, location, source, priority, is_bulk, scheduled_for, status, error_code,
        requested_by, requested_by_user_id, idempotency_key
      ) VALUES (
        v_campaign_id, v_session.id, v_slot, '91' || v_phone10, v_phone10, v_item->>'recipient_name',
        NULLIF(v_item->>'lead_id', '')::uuid, NULLIF(v_item->>'customer_id', '')::uuid, NULLIF(v_item->>'professional_id', '')::uuid,
        COALESCE(v_item->>'message_type', 'text'), v_item->>'rendered_body', COALESCE(v_item->'placeholder_values', '{}'::jsonb),
        COALESCE(v_item->'media_ref', p_payload->'media_ref'), COALESCE(v_item->'location', p_payload->'location'),
        v_source, COALESCE((v_item->>'priority')::smallint, 5),
        (v_kind = 'bulk'), v_scheduled_start, 'skipped_opt_out', 'SUPPRESSED',
        v_caller_name, v_caller_uid, v_request_id || ':' || v_idx::text
      );
    ELSE
      v_queued_count := v_queued_count + 1;
      INSERT INTO public.whatsapp_queue (
        campaign_id, session_id, slot, recipient_phone, recipient_phone10, recipient_name,
        lead_id, customer_id, professional_id, message_type, rendered_body, placeholder_values,
        media_ref, location, source, priority, is_bulk, scheduled_for, expires_at, status,
        requested_by, requested_by_user_id, idempotency_key
      ) VALUES (
        v_campaign_id, v_session.id, v_slot, '91' || v_phone10, v_phone10, v_item->>'recipient_name',
        NULLIF(v_item->>'lead_id', '')::uuid, NULLIF(v_item->>'customer_id', '')::uuid, NULLIF(v_item->>'professional_id', '')::uuid,
        COALESCE(v_item->>'message_type', 'text'), v_item->>'rendered_body', COALESCE(v_item->'placeholder_values', '{}'::jsonb),
        COALESCE(v_item->'media_ref', p_payload->'media_ref'), COALESCE(v_item->'location', p_payload->'location'),
        v_source, COALESCE((v_item->>'priority')::smallint, CASE WHEN v_source IN ('auto_reply', 'opt_out_confirm') THEN 2 ELSE 5 END),
        (v_kind = 'bulk'), v_scheduled_start, v_scheduled_start + interval '7 days', 'queued',
        v_caller_name, v_caller_uid, v_request_id || ':' || v_idx::text
      );
    END IF;
  END LOOP;

  IF v_queued_count = 0 THEN
    UPDATE public.whatsapp_campaigns
       SET status = 'completed', finished_at = now(), updated_at = now()
     WHERE id = v_campaign_id;
  END IF;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'replayed', false,
    'queued', v_queued_count,
    'skipped', v_skipped_count
  );
END;
$$;

-- 6.3 wa_expire_leases()
CREATE OR REPLACE FUNCTION public.wa_expire_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    UPDATE public.whatsapp_queue q
       SET status = 'needs_review',
           error_code = 'LEASE_EXPIRED',
           last_error = 'Send lease expired before worker reported outcome; flagged for manual review (never auto-retried)',
           updated_at = now()
     WHERE q.status = 'sending'
       AND q.lease_expires_at IS NOT NULL
       AND q.lease_expires_at < now()
    RETURNING q.id, q.session_id, q.claimed_by
  LOOP
    v_expired_count := v_expired_count + 1;
    INSERT INTO public.whatsapp_events (level, session_id, worker_id, code, detail)
    VALUES (
      'warn',
      v_row.session_id,
      v_row.claimed_by,
      'LEASE_EXPIRED',
      jsonb_build_object('queue_id', v_row.id)
    );
  END LOOP;

  RETURN v_expired_count;
END;
$$;

-- 6.4 wa_claim_next(p_worker_id text, p_session_id uuid)
CREATE OR REPLACE FUNCTION public.wa_claim_next(p_worker_id text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.whatsapp_settings%ROWTYPE;
  v_session public.whatsapp_sessions%ROWTYPE;
  v_shared_slots boolean := false;
  v_enforce_hours boolean := false;
  v_now_ist time;
  v_day_start_ist timestamptz;
  v_last_claim_at timestamptz;
  v_daily_limit integer;
  v_configured_new_cap integer;
  v_effective_new_cap integer;
  v_warmup_days integer;
  v_sent_today integer;
  v_new_recipients_today integer;
  v_candidate public.whatsapp_queue%ROWTYPE;
  v_phone10 text;
  v_is_new_recipient boolean;
  v_attempt_id uuid;
BEGIN
  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;

  -- Check 1: Module enabled and kill switch off
  IF NOT COALESCE(v_settings.module_enabled, false) OR COALESCE(v_settings.kill_switch, false) THEN
    RETURN NULL;
  END IF;

  -- Check 2: Session connected, not paused, desired_state connected
  SELECT * INTO v_session
    FROM public.whatsapp_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_session.status <> 'connected'
     OR COALESCE(v_session.paused, false)
     OR v_session.desired_state <> 'connected' THEN
    RETURN NULL;
  END IF;

  v_shared_slots := COALESCE(v_settings.allow_shared_slots, false)
    AND v_settings.main_session_id IS NOT NULL
    AND v_settings.main_session_id = v_settings.bulk_session_id
    AND v_settings.main_session_id = v_session.id;

  -- Check 3: Business hours in Asia/Kolkata when slot requires it
  IF v_session.slot = 'bulk' OR v_shared_slots THEN
    v_enforce_hours := COALESCE(v_settings.bulk_business_hours_only, true);
  ELSE
    v_enforce_hours := COALESCE(v_settings.main_business_hours_only, false);
  END IF;

  IF v_enforce_hours THEN
    v_now_ist := (now() AT TIME ZONE COALESCE(v_settings.timezone, 'Asia/Kolkata'))::time;
    IF v_now_ist < v_settings.business_hours_start OR v_now_ist > v_settings.business_hours_end THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Check 4: At least (pace_min_seconds - 5) seconds since session's last claim
  SELECT max(q.claimed_at)
    INTO v_last_claim_at
    FROM public.whatsapp_queue q
   WHERE q.session_id = v_session.id
     AND q.claimed_at > now() - interval '10 minutes';

  IF v_last_claim_at IS NOT NULL
     AND v_last_claim_at > now() - make_interval(secs => GREATEST(0, v_settings.pace_min_seconds - 5)) THEN
    RETURN NULL;
  END IF;

  -- Check 5: Daily outbound cap & warm-up new-recipient cap
  v_day_start_ist := date_trunc('day', now() AT TIME ZONE COALESCE(v_settings.timezone, 'Asia/Kolkata'))
                     AT TIME ZONE COALESCE(v_settings.timezone, 'Asia/Kolkata');

  IF v_session.daily_cap_override IS NOT NULL THEN
    v_daily_limit := LEAST(v_session.daily_cap_override, 200);
  ELSIF v_shared_slots OR v_session.slot = 'main' THEN
    v_daily_limit := LEAST(COALESCE(v_settings.daily_limit_main, 60), 200);
  ELSIF v_session.slot = 'bulk' THEN
    v_daily_limit := LEAST(COALESCE(v_settings.daily_limit_bulk, 100), 200);
  ELSE
    v_daily_limit := LEAST(COALESCE(v_settings.personal_daily_limit, 40), 200);
  END IF;

  SELECT count(*)::integer
    INTO v_sent_today
    FROM public.whatsapp_messages m
   WHERE m.session_id = v_session.id
     AND m.direction = 'outbound'
     AND m.created_at >= v_day_start_ist;

  IF v_sent_today >= v_daily_limit THEN
    RETURN NULL;
  END IF;

  IF v_shared_slots OR v_session.slot = 'main' THEN
    v_configured_new_cap := COALESCE(v_settings.main_new_recipient_cap, 25);
  ELSIF v_session.slot = 'bulk' THEN
    v_configured_new_cap := COALESCE(v_settings.bulk_new_recipient_cap, 30);
  ELSE
    v_configured_new_cap := COALESCE(v_settings.personal_new_recipient_cap, 15);
  END IF;

  IF COALESCE(v_settings.warmup_enabled, true) THEN
    v_warmup_days := GREATEST(1, floor(EXTRACT(EPOCH FROM (now() - COALESCE(v_session.warmup_started_at, now()))) / 86400.0)::integer + 1);
    IF v_warmup_days <= 3 THEN
      v_effective_new_cap := LEAST(10, v_configured_new_cap);
    ELSIF v_warmup_days <= 7 THEN
      v_effective_new_cap := LEAST(20, v_configured_new_cap);
    ELSIF v_warmup_days <= 14 THEN
      v_effective_new_cap := LEAST(30, v_configured_new_cap);
    ELSE
      v_effective_new_cap := v_configured_new_cap;
    END IF;
  ELSE
    v_effective_new_cap := v_configured_new_cap;
  END IF;

  SELECT count(DISTINCT m.phone10)::integer
    INTO v_new_recipients_today
    FROM public.whatsapp_messages m
   WHERE m.session_id = v_session.id
     AND m.direction = 'outbound'
     AND m.created_at >= v_day_start_ist
     AND m.phone10 IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.whatsapp_messages prev
        WHERE prev.phone10 = m.phone10
          AND prev.created_at < v_day_start_ist
          AND (
            prev.direction = 'inbound'
            OR (prev.session_id = v_session.id AND prev.created_at >= v_day_start_ist - interval '90 days')
          )
     );

  -- Check 6: Iterate queued candidates with active campaigns using FOR UPDATE OF q SKIP LOCKED
  FOR v_candidate IN
    SELECT q.*
      FROM public.whatsapp_queue q
      JOIN public.whatsapp_campaigns c ON c.id = q.campaign_id
     WHERE q.session_id = v_session.id
       AND q.status = 'queued'
       AND q.scheduled_for <= now()
       AND c.status IN ('scheduled', 'running')
     ORDER BY q.priority ASC, q.scheduled_for ASC, q.created_at ASC
     FOR UPDATE OF q SKIP LOCKED
  LOOP
    -- Expired check
    IF v_candidate.expires_at IS NOT NULL AND v_candidate.expires_at < now() THEN
      UPDATE public.whatsapp_queue
         SET status = 'failed',
             error_code = 'EXPIRED',
             last_error = 'Message expired before it could be claimed',
             failed_at = now(),
             processed_at = now(),
             updated_at = now()
       WHERE id = v_candidate.id;
      CONTINUE;
    END IF;

    v_phone10 := public.normalize_phone_10(COALESCE(v_candidate.recipient_phone10, v_candidate.recipient_phone));
    IF v_phone10 IS NULL THEN
      UPDATE public.whatsapp_queue
         SET status = 'skipped_invalid',
             error_code = 'PHONE_INVALID',
             last_error = 'Invalid 10-digit Indian mobile number',
             processed_at = now(),
             updated_at = now()
       WHERE id = v_candidate.id;
      CONTINUE;
    END IF;

    IF v_candidate.source <> 'opt_out_confirm' AND public.wa_phone_suppressed(v_phone10) THEN
      UPDATE public.whatsapp_queue
         SET status = 'skipped_opt_out',
             error_code = 'SUPPRESSED',
             last_error = 'Recipient opted out or is suppressed',
             processed_at = now(),
             updated_at = now()
       WHERE id = v_candidate.id;
      CONTINUE;
    END IF;

    v_is_new_recipient := NOT EXISTS (
      SELECT 1
        FROM public.whatsapp_messages hist
       WHERE hist.phone10 = v_phone10
         AND (
           hist.direction = 'inbound'
           OR (hist.session_id = v_session.id AND hist.created_at >= now() - interval '90 days')
         )
    );

    IF v_is_new_recipient AND v_new_recipients_today >= v_effective_new_cap THEN
      CONTINUE;
    END IF;

    -- Check 7: Claim the candidate row
    v_attempt_id := gen_random_uuid();

    UPDATE public.whatsapp_queue
       SET status = 'sending',
           recipient_phone10 = v_phone10,
           recipient_phone = '91' || v_phone10,
           attempts = attempts + 1,
           claimed_by = p_worker_id,
           claim_attempt_id = v_attempt_id,
           claimed_at = now(),
           lease_expires_at = now() + interval '180 seconds',
           updated_at = now()
     WHERE id = v_candidate.id
     RETURNING * INTO v_candidate;

    UPDATE public.whatsapp_campaigns
       SET started_at = COALESCE(started_at, now()),
           status = CASE WHEN status = 'scheduled' THEN 'running' ELSE status END,
           updated_at = now()
     WHERE id = v_candidate.campaign_id;

    RETURN jsonb_build_object(
      'queue_id', v_candidate.id,
      'campaign_id', v_candidate.campaign_id,
      'attempt_id', v_attempt_id,
      'session_id', v_session.id,
      'session_key', v_session.session_key,
      'slot', v_candidate.slot,
      'recipient_phone', v_candidate.recipient_phone,
      'recipient_phone10', v_candidate.recipient_phone10,
      'recipient_jid', v_candidate.recipient_jid,
      'recipient_name', v_candidate.recipient_name,
      'message_type', v_candidate.message_type,
      'body', v_candidate.rendered_body,
      'media_ref', v_candidate.media_ref,
      'location', v_candidate.location,
      'source', v_candidate.source
    );
  END LOOP;

  RETURN NULL;
END;
$$;

-- 6.5 wa_report_result(p_queue_id uuid, p_attempt_id uuid, p_outcome jsonb)
CREATE OR REPLACE FUNCTION public.wa_report_result(
  p_queue_id uuid,
  p_attempt_id uuid,
  p_outcome jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.whatsapp_queue%ROWTYPE;
  v_settings public.whatsapp_settings%ROWTYPE;
  v_kind text := COALESCE(p_outcome->>'status', 'unknown');
  v_provider_msg_id text := NULLIF(btrim(p_outcome->>'provider_message_id'), '');
  v_error_code text := NULLIF(btrim(p_outcome->>'error_code'), '');
  v_error_msg text := NULLIF(btrim(p_outcome->>'error_message'), '');
  v_retry_after integer := COALESCE((p_outcome->>'retry_after_seconds')::integer, 60);
  v_msg_id uuid;
  v_recent_failures integer := 0;
  v_admin record;
BEGIN
  SELECT * INTO v_row
    FROM public.whatsapp_queue
   WHERE id = p_queue_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('acked', false, 'reason', 'NOT_FOUND');
  END IF;

  -- Ignore stale attempt_id
  IF v_row.claim_attempt_id IS DISTINCT FROM p_attempt_id OR v_row.status <> 'sending' THEN
    RETURN jsonb_build_object('acked', true, 'stale', true, 'current_status', v_row.status);
  END IF;

  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;

  IF v_kind = 'sent' THEN
    UPDATE public.whatsapp_queue
       SET status = 'sent',
           provider_message_id = v_provider_msg_id,
           recipient_jid = COALESCE(NULLIF(p_outcome->>'recipient_jid', ''), recipient_jid),
           sent_at = COALESCE((p_outcome->>'sent_at')::timestamptz, now()),
           processed_at = now(),
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = v_row.id;

    INSERT INTO public.whatsapp_messages (
      session_id,
      direction,
      origin,
      queue_id,
      campaign_id,
      sent_by,
      sent_by_user_id,
      phone_e164,
      phone10,
      jid,
      lead_id,
      customer_id,
      professional_id,
      message_type,
      body,
      media,
      location,
      related_entity_type,
      related_entity_id,
      status,
      provider,
      provider_message_id,
      sent_at
    ) VALUES (
      v_row.session_id,
      'outbound',
      CASE
        WHEN v_row.source = 'auto_reply' THEN 'auto_reply'
        WHEN v_row.source = 'opt_out_confirm' THEN 'system'
        ELSE 'crm'
      END,
      v_row.id,
      v_row.campaign_id,
      v_row.requested_by,
      v_row.requested_by_user_id,
      v_row.recipient_phone,
      v_row.recipient_phone10,
      COALESCE(NULLIF(p_outcome->>'recipient_jid', ''), v_row.recipient_jid),
      v_row.lead_id,
      v_row.customer_id,
      v_row.professional_id,
      CASE
        WHEN v_row.message_type = 'media' THEN
          CASE
            WHEN (v_row.media_ref->>'kind') IN ('image', 'document', 'catalogue') THEN v_row.media_ref->>'kind'
            ELSE 'document'
          END
        ELSE v_row.message_type
      END,
      left(v_row.rendered_body, 4096),
      v_row.media_ref,
      v_row.location,
      v_row.placeholder_values->>'related_entity_type',
      NULLIF(v_row.placeholder_values->>'related_entity_id', '')::uuid,
      'sent',
      'baileys',
      v_provider_msg_id,
      COALESCE((p_outcome->>'sent_at')::timestamptz, now())
    )
    RETURNING id INTO v_msg_id;

    -- Isolated activity_log write so any failure never rolls back 'sent' status
    IF v_row.lead_id IS NOT NULL OR v_row.customer_id IS NOT NULL OR v_row.professional_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.activity_log (
          lead_id,
          customer_id,
          activity_type,
          activity_category,
          user_id,
          user_name,
          title,
          description,
          related_entity_type,
          related_entity_id,
          metadata,
          is_manual
        ) VALUES (
          v_row.lead_id,
          v_row.customer_id,
          'whatsapp_sent',
          'communication',
          COALESCE(v_row.requested_by_user_id::text, 'system'),
          v_row.requested_by,
          left(COALESCE(v_row.rendered_body, '[WhatsApp Attachment/Location]'), 60),
          left(COALESCE(v_row.rendered_body, '[WhatsApp Attachment/Location]'), 500),
          CASE WHEN v_row.professional_id IS NOT NULL THEN 'professional' ELSE NULL END,
          v_row.professional_id,
          jsonb_build_object(
            'campaign_id', v_row.campaign_id,
            'queue_id', v_row.id,
            'message_id', v_msg_id,
            'slot', v_row.slot
          ),
          false
        );
      EXCEPTION
        WHEN OTHERS THEN
          INSERT INTO public.whatsapp_events (level, session_id, worker_id, code, detail)
          VALUES (
            'warn',
            v_row.session_id,
            v_row.claimed_by,
            'ACTIVITY_LOG_WRITE_FAILED',
            jsonb_build_object('queue_id', v_row.id, 'sqlstate', SQLSTATE)
          );
      END;
    END IF;

    UPDATE public.whatsapp_sessions
       SET last_active_at = now(),
           updated_at = now()
     WHERE id = v_row.session_id;

  ELSIF v_kind = 'deferred' THEN
    IF COALESCE((v_row.placeholder_values->>'_defer_count')::integer, 0) >= 5 THEN
      UPDATE public.whatsapp_queue
         SET status = 'failed',
             error_code = 'DEFERRED_TOO_LONG',
             last_error = COALESCE(v_error_msg, 'Deferred more than 5 times before send'),
             failed_at = now(),
             processed_at = now(),
             lease_expires_at = NULL,
             updated_at = now()
       WHERE id = v_row.id;
    ELSE
      UPDATE public.whatsapp_queue
         SET status = 'queued',
             attempts = GREATEST(0, attempts - 1),
             scheduled_for = now() + make_interval(secs => GREATEST(10, v_retry_after)),
             placeholder_values = jsonb_set(
               COALESCE(placeholder_values, '{}'::jsonb),
               '{_defer_count}',
               to_jsonb(COALESCE((placeholder_values->>'_defer_count')::integer, 0) + 1)
             ),
             last_error = v_error_msg,
             claimed_by = NULL,
             claim_attempt_id = NULL,
             lease_expires_at = NULL,
             updated_at = now()
       WHERE id = v_row.id;
    END IF;

  ELSIF v_kind = 'failed' THEN
    UPDATE public.whatsapp_queue
       SET status = 'failed',
           error_code = COALESCE(v_error_code, 'SEND_FAILED'),
           last_error = v_error_msg,
           failed_at = now(),
           processed_at = now(),
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = v_row.id;

    -- Count consecutive session/transport failures (excluding recipient-level errors like EXPIRED or NOT_ON_WHATSAPP)
    SELECT count(*)::integer
      INTO v_recent_failures
      FROM public.whatsapp_queue q
     WHERE q.session_id = v_row.session_id
       AND q.status = 'failed'
       AND COALESCE(q.error_code, 'SEND_FAILED') NOT IN (
         'EXPIRED',
         'NOT_ON_WHATSAPP',
         'PHONE_INVALID',
         'SUPPRESSED',
         'MEDIA_INVALID'
       )
       AND q.failed_at > COALESCE(
         (SELECT max(s.sent_at) FROM public.whatsapp_queue s WHERE s.session_id = v_row.session_id AND s.status = 'sent'),
         now() - interval '24 hours'
       );

    IF v_recent_failures >= COALESCE(v_settings.max_consecutive_failures, 3) THEN
      UPDATE public.whatsapp_sessions
         SET status = 'paused_safety',
             paused = true,
             paused_reason = 'SAFETY_PAUSE: ' || v_recent_failures::text || ' consecutive send failures',
             paused_at = now(),
             updated_at = now()
       WHERE id = v_row.session_id;

      UPDATE public.whatsapp_campaigns
         SET status = 'paused_safety',
             updated_at = now()
       WHERE id = v_row.campaign_id
         AND status IN ('scheduled', 'running');

      INSERT INTO public.whatsapp_events (level, session_id, worker_id, code, detail)
      VALUES (
        'error',
        v_row.session_id,
        v_row.claimed_by,
        'SAFETY_PAUSE',
        jsonb_build_object('consecutive_failures', v_recent_failures, 'queue_id', v_row.id)
      );

      BEGIN
        FOR v_admin IN
          SELECT DISTINCT ur.user_id::text AS uid
            FROM public.user_roles ur
           WHERE ur.role IN ('admin', 'super_admin')
        LOOP
          INSERT INTO public.notifications (user_id, title, message, type, priority, is_read)
          VALUES (
            v_admin.uid,
            'WhatsApp Safety Pause Triggered',
            'Session paused automatically after ' || v_recent_failures::text || ' consecutive transport failures.',
            'error',
            'urgent',
            false
          );
        END LOOP;
      EXCEPTION
        WHEN OTHERS THEN
          INSERT INTO public.whatsapp_events (level, session_id, worker_id, code, detail)
          VALUES (
            'warn',
            v_row.session_id,
            v_row.claimed_by,
            'NOTIFICATION_WRITE_FAILED',
            jsonb_build_object('queue_id', v_row.id, 'sqlstate', SQLSTATE)
          );
      END;
    END IF;

  ELSE
    UPDATE public.whatsapp_queue
       SET status = 'needs_review',
           error_code = COALESCE(v_error_code, 'OUTCOME_UNKNOWN'),
           last_error = COALESCE(v_error_msg, 'Send outcome unknown; manual review required'),
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = v_row.id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.whatsapp_queue q
     WHERE q.campaign_id = v_row.campaign_id
       AND q.status IN ('queued', 'sending')
  ) THEN
    UPDATE public.whatsapp_campaigns
       SET status = CASE WHEN status = 'paused_safety' THEN 'paused_safety' ELSE 'completed' END,
           finished_at = now(),
           updated_at = now()
     WHERE id = v_row.campaign_id
       AND status NOT IN ('cancelled', 'paused_safety');
  END IF;

  RETURN jsonb_build_object('acked', true, 'queue_id', v_row.id, 'final_status', v_kind);
END;
$$;

-- 6.6 wa_apply_opt_out(p_phone10 text, p_source_message_id uuid)
CREATE OR REPLACE FUNCTION public.wa_apply_opt_out(
  p_phone10 text,
  p_source_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone10 text := public.normalize_phone_10(p_phone10);
  v_matches jsonb;
  v_skipped_rows integer := 0;
BEGIN
  IF v_phone10 IS NULL THEN
    RAISE EXCEPTION 'PHONE_INVALID: Valid 10-digit Indian mobile number required' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'entity_type', m.entity_type,
               'entity_id', m.entity_id,
               'name', m.name,
               'assigned_to', m.assigned_to
             )
           ),
           '[]'::jsonb
         )
    INTO v_matches
    FROM public.wa_match_entities(v_phone10) m;

  -- Authority lives in whatsapp_suppressions (avoids firing automation_trigger on leads/customers/professionals)
  INSERT INTO public.whatsapp_suppressions (
    phone10,
    reason,
    source_message_id,
    matched_entities,
    created_by,
    created_by_user_id,
    lifted_at,
    lifted_by,
    lifted_by_user_id,
    lift_reason
  ) VALUES (
    v_phone10,
    'keyword',
    p_source_message_id,
    v_matches,
    'Inbound',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (phone10) DO UPDATE
    SET reason = 'keyword',
        source_message_id = COALESCE(EXCLUDED.source_message_id, public.whatsapp_suppressions.source_message_id),
        matched_entities = EXCLUDED.matched_entities,
        lifted_at = NULL,
        lifted_by = NULL,
        lifted_by_user_id = NULL,
        lift_reason = NULL;

  WITH skipped AS (
    UPDATE public.whatsapp_queue
       SET status = 'skipped_opt_out',
           error_code = 'SUPPRESSED',
           last_error = 'Recipient opted out via STOP/UNSUBSCRIBE',
           processed_at = now(),
           updated_at = now()
     WHERE recipient_phone10 = v_phone10
       AND status = 'queued'
       AND source <> 'opt_out_confirm'
    RETURNING id
  )
  SELECT count(*)::integer INTO v_skipped_rows FROM skipped;

  RETURN jsonb_build_object(
    'phone10', v_phone10,
    'matched_entities', v_matches,
    'skipped_queue_rows', v_skipped_rows
  );
END;
$$;

-- 6.7 wa_cancel_item(p_id uuid) & wa_cancel_campaign(p_id uuid, p_reason text)
CREATE OR REPLACE FUNCTION public.wa_cancel_item(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.whatsapp_queue%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.whatsapp_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_uid IS NOT NULL AND NOT public.is_admin() AND v_row.requested_by_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the requester or an admin can cancel this item' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('queued', 'needs_review') THEN
    RETURN false;
  END IF;

  UPDATE public.whatsapp_queue
     SET status = 'cancelled',
         processed_at = now(),
         updated_at = now()
   WHERE id = p_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_cancel_campaign(p_id uuid, p_reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text := CASE WHEN auth.uid() IS NOT NULL THEN public.wa_current_user_name() ELSE 'system' END;
  v_campaign public.whatsapp_campaigns%ROWTYPE;
  v_cancelled integer := 0;
BEGIN
  SELECT * INTO v_campaign FROM public.whatsapp_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_uid IS NOT NULL AND NOT public.is_admin() AND v_campaign.requested_by_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the requester or an admin can cancel this campaign' USING ERRCODE = '42501';
  END IF;

  IF v_campaign.status IN ('completed', 'cancelled') THEN
    RETURN 0;
  END IF;

  WITH c AS (
    UPDATE public.whatsapp_queue
       SET status = 'cancelled',
           processed_at = now(),
           updated_at = now()
     WHERE campaign_id = p_id
       AND status = 'queued'
    RETURNING id
  )
  SELECT count(*)::integer INTO v_cancelled FROM c;

  UPDATE public.whatsapp_campaigns
     SET status = 'cancelled',
         cancelled_by = v_actor_name,
         cancel_reason = p_reason,
         finished_at = now(),
         updated_at = now()
   WHERE id = p_id
     AND status NOT IN ('completed', 'cancelled');

  RETURN v_cancelled;
END;
$$;

-- 6.8 wa_library_register(p_path text, p_title text, p_kind text, p_mime text, p_size_bytes bigint, p_sha256 text)
CREATE OR REPLACE FUNCTION public.wa_library_register(
  p_path text,
  p_title text,
  p_kind text,
  p_mime text,
  p_size_bytes bigint,
  p_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin_name text := public.wa_current_user_name();
  v_settings public.whatsapp_settings%ROWTYPE;
  v_current_bytes bigint := 0;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin required to register library items' USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL OR p_path NOT LIKE 'whatsapp-library/%' THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Path must start with whatsapp-library/' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects o
     WHERE o.bucket_id = 'crm-attachments'
       AND o.name = p_path
  ) THEN
    RAISE EXCEPTION 'MEDIA_INVALID: Object does not exist in crm-attachments at %', p_path USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_settings FROM public.whatsapp_settings LIMIT 1;

  SELECT COALESCE(sum(size_bytes), 0)::bigint
    INTO v_current_bytes
    FROM public.whatsapp_library_items
   WHERE active = true;

  IF (v_current_bytes + COALESCE(p_size_bytes, 0)) > (COALESCE(v_settings.library_quota_mb, 250)::bigint * 1024 * 1024) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Library quota of % MB exceeded', v_settings.library_quota_mb USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.whatsapp_library_items (
    title,
    kind,
    bucket,
    path,
    filename,
    mime,
    size_bytes,
    sha256,
    active,
    created_by,
    created_by_user_id
  ) VALUES (
    p_title,
    p_kind,
    'crm-attachments',
    p_path,
    regexp_replace(p_path, '^.*/', ''),
    p_mime,
    p_size_bytes,
    p_sha256,
    true,
    v_admin_name,
    v_uid
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 6.9 wa_reconcile_flags()
CREATE OR REPLACE FUNCTION public.wa_reconcile_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_suppressions integer := 0;
BEGIN
  -- whatsapp_suppressions is the sole authority; we do not mutate leads/customers/professionals
  -- so automation_trigger and updated_at on CRM records are never disturbed.
  SELECT count(*)::integer
    INTO v_active_suppressions
    FROM public.whatsapp_suppressions
   WHERE lifted_at IS NULL;

  RETURN jsonb_build_object(
    'active_suppressions', v_active_suppressions,
    'authority', 'whatsapp_suppressions'
  );
END;
$$;

-- 6.10 wa_erase_contact(p_phone10 text)
CREATE OR REPLACE FUNCTION public.wa_erase_contact(p_phone10 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone10 text := public.normalize_phone_10(p_phone10);
  v_admin_name text := CASE WHEN auth.uid() IS NOT NULL THEN public.wa_current_user_name() ELSE 'system' END;
  v_redacted integer := 0;
  v_activity_redacted integer := 0;
  v_pool_deleted integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin required for contact erasure' USING ERRCODE = '42501';
  END IF;

  IF v_phone10 IS NULL THEN
    RAISE EXCEPTION 'PHONE_INVALID: Valid 10-digit Indian mobile number required' USING ERRCODE = 'P0001';
  END IF;

  WITH r AS (
    UPDATE public.whatsapp_messages
       SET body = NULL,
           media = NULL,
           location = NULL,
           redacted_at = now()
     WHERE phone10 = v_phone10
       AND redacted_at IS NULL
    RETURNING id
  ),
  act AS (
    UPDATE public.activity_log a
       SET title = '[WhatsApp Message Redacted]',
           description = '[Redacted per contact erasure request]'
     WHERE a.activity_type IN ('whatsapp_sent', 'whatsapp_received')
       AND EXISTS (
         SELECT 1
           FROM public.whatsapp_messages m
          WHERE m.phone10 = v_phone10
            AND (a.metadata->>'message_id') = m.id::text
       )
    RETURNING a.id
  )
  SELECT
    (SELECT count(*)::integer FROM r),
    (SELECT count(*)::integer FROM act)
    INTO v_redacted, v_activity_redacted;

  WITH d AS (
    DELETE FROM public.whatsapp_inbound_pool
     WHERE phone10 = v_phone10
    RETURNING id
  )
  SELECT count(*)::integer INTO v_pool_deleted FROM d;

  DELETE FROM public.whatsapp_auto_reply_log WHERE phone10 = v_phone10;

  INSERT INTO public.whatsapp_events (level, code, detail)
  VALUES (
    'info',
    'CONTACT_ERASED',
    jsonb_build_object(
      'erased_by', v_admin_name,
      'messages_redacted', v_redacted,
      'activity_logs_redacted', v_activity_redacted,
      'pool_rows_deleted', v_pool_deleted
    )
  );

  RETURN jsonb_build_object(
    'messages_redacted', v_redacted,
    'activity_logs_redacted', v_activity_redacted,
    'pool_rows_deleted', v_pool_deleted
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Row-Level Security, Table Privileges & Function Execution Lockdown
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_pol record;
BEGIN
  FOR v_pol IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'whatsapp_settings', 'whatsapp_sessions', 'whatsapp_user_permissions',
         'whatsapp_campaigns', 'whatsapp_queue', 'whatsapp_messages',
         'whatsapp_suppressions', 'whatsapp_inbound_pool', 'whatsapp_auto_replies',
         'whatsapp_auto_reply_log', 'whatsapp_library_items',
         'whatsapp_worker_instances', 'whatsapp_events'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_auto_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_auto_reply_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_worker_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;

-- Revoke anon access across all WhatsApp tables and views
REVOKE ALL ON
  public.whatsapp_settings,
  public.whatsapp_sessions,
  public.whatsapp_user_permissions,
  public.whatsapp_campaigns,
  public.whatsapp_queue,
  public.whatsapp_messages,
  public.whatsapp_suppressions,
  public.whatsapp_inbound_pool,
  public.whatsapp_auto_replies,
  public.whatsapp_auto_reply_log,
  public.whatsapp_library_items,
  public.whatsapp_worker_instances,
  public.whatsapp_events,
  public.whatsapp_settings_public,
  public.whatsapp_campaign_progress
FROM anon;

-- Revoke direct client writes on RPC/Edge-only tables
REVOKE INSERT, UPDATE, DELETE ON
  public.whatsapp_sessions,
  public.whatsapp_campaigns,
  public.whatsapp_queue,
  public.whatsapp_messages,
  public.whatsapp_suppressions,
  public.whatsapp_worker_instances,
  public.whatsapp_events
FROM authenticated;

GRANT SELECT ON
  public.whatsapp_settings_public,
  public.whatsapp_campaign_progress
TO authenticated;

-- 7.1 whatsapp_settings policies (Admin: read, update)
CREATE POLICY whatsapp_settings_admin_select
  ON public.whatsapp_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY whatsapp_settings_admin_update
  ON public.whatsapp_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7.2 whatsapp_sessions policies (Admin: read all; Owner: read own personal row)
CREATE POLICY whatsapp_sessions_select
  ON public.whatsapp_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (slot = 'personal' AND owner_user_id = auth.uid())
  );

-- 7.3 whatsapp_user_permissions policies (Admin: read, write; Owner: read own)
CREATE POLICY whatsapp_user_permissions_select
  ON public.whatsapp_user_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

CREATE POLICY whatsapp_user_permissions_admin_all
  ON public.whatsapp_user_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7.4 whatsapp_campaigns & whatsapp_queue policies (Admin: read all; Requester: read own)
CREATE POLICY whatsapp_campaigns_select
  ON public.whatsapp_campaigns
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR requested_by_user_id = auth.uid());

CREATE POLICY whatsapp_queue_select
  ON public.whatsapp_queue
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR requested_by_user_id = auth.uid());

-- 7.5 whatsapp_messages policies (Admin: read all; Sender: read own; Assigned staff: read assigned records)
CREATE POLICY whatsapp_messages_select
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR sent_by_user_id = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
           WHERE l.id = whatsapp_messages.lead_id
             AND public.is_assigned_to_me(l.assigned_to)
        ))
    OR (customer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.customers c
           WHERE c.id = whatsapp_messages.customer_id
             AND public.is_assigned_to_me(c.assigned_to)
        ))
    OR (professional_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.professionals p
           WHERE p.id = whatsapp_messages.professional_id
             AND public.is_assigned_to_me(p.assigned_to)
        ))
  );

-- 7.6 whatsapp_suppressions policies (Admin: read)
CREATE POLICY whatsapp_suppressions_admin_select
  ON public.whatsapp_suppressions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 7.7 whatsapp_inbound_pool, whatsapp_auto_replies, whatsapp_auto_reply_log (Admin: read, write)
CREATE POLICY whatsapp_inbound_pool_admin_all
  ON public.whatsapp_inbound_pool
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY whatsapp_auto_replies_admin_all
  ON public.whatsapp_auto_replies
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY whatsapp_auto_reply_log_admin_all
  ON public.whatsapp_auto_reply_log
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7.8 whatsapp_library_items (Admin: read, write; Staff: read active items)
CREATE POLICY whatsapp_library_items_select
  ON public.whatsapp_library_items
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR active = true);

CREATE POLICY whatsapp_library_items_admin_write
  ON public.whatsapp_library_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7.9 whatsapp_worker_instances & whatsapp_events (Admin: read)
CREATE POLICY whatsapp_worker_instances_admin_select
  ON public.whatsapp_worker_instances
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY whatsapp_events_admin_select
  ON public.whatsapp_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 7.10 Function Execution Privileges Lockdown
REVOKE ALL ON FUNCTION
  public.normalize_phone_10(text),
  public.wa_is_valid_attribution_name(text),
  public.wa_is_valid_media_ref(jsonb),
  public.wa_current_user_name(),
  public.wa_can(text),
  public.wa_phone_suppressed(text),
  public.wa_match_entities(text),
  public.wa_slot_status(),
  public.wa_create_campaign(jsonb),
  public.wa_expire_leases(),
  public.wa_claim_next(text, uuid),
  public.wa_report_result(uuid, uuid, jsonb),
  public.wa_apply_opt_out(text, uuid),
  public.wa_cancel_item(uuid),
  public.wa_cancel_campaign(uuid, text),
  public.wa_library_register(text, text, text, text, bigint, text),
  public.wa_reconcile_flags(),
  public.wa_erase_contact(text)
FROM PUBLIC, anon, authenticated;

-- Grant execute on user/admin-facing RPCs and pure helpers to authenticated & service_role
GRANT EXECUTE ON FUNCTION
  public.normalize_phone_10(text),
  public.wa_is_valid_attribution_name(text),
  public.wa_is_valid_media_ref(jsonb),
  public.wa_current_user_name(),
  public.wa_can(text),
  public.wa_slot_status(),
  public.wa_cancel_item(uuid),
  public.wa_cancel_campaign(uuid, text),
  public.wa_library_register(text, text, text, text, bigint, text),
  public.wa_erase_contact(text)
TO authenticated, service_role;

-- Grant execute on worker/control-plane-only RPCs strictly to service_role
GRANT EXECUTE ON FUNCTION
  public.wa_phone_suppressed(text),
  public.wa_match_entities(text),
  public.wa_create_campaign(jsonb),
  public.wa_expire_leases(),
  public.wa_claim_next(text, uuid),
  public.wa_report_result(uuid, uuid, jsonb),
  public.wa_apply_opt_out(text, uuid),
  public.wa_reconcile_flags()
TO service_role;

-- ----------------------------------------------------------------------------
-- 8. Realtime Publication Registration (for UI Campaign/Session/Queue Updates)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_campaigns'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_campaigns;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_queue'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_queue;
    END IF;
  END IF;
END $$;

COMMIT;
