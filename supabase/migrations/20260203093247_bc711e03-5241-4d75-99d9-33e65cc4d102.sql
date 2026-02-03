-- Backup & Restore tracking tables + storage bucket

-- 1) Tables
CREATE TABLE IF NOT EXISTS public.crm_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT public.get_current_user_email(),
  status text NOT NULL DEFAULT 'queued',
  include_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  formats jsonb NOT NULL DEFAULT '["json","xlsx"]'::jsonb,
  result_summary jsonb NULL,
  json_file_path text NULL,
  xlsx_file_path text NULL,
  log jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_backups_created_at ON public.crm_backups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_backups_status ON public.crm_backups (status);

CREATE TABLE IF NOT EXISTS public.crm_restores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT public.get_current_user_email(),
  status text NOT NULL DEFAULT 'queued',
  mode text NOT NULL DEFAULT 'merge',
  include_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_backup_id uuid NULL REFERENCES public.crm_backups(id) ON DELETE SET NULL,
  source_file_path text NULL,
  result_summary jsonb NULL,
  log jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_restores_created_at ON public.crm_restores (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_restores_status ON public.crm_restores (status);
CREATE INDEX IF NOT EXISTS idx_crm_restores_mode ON public.crm_restores (mode);

-- 2) RLS
ALTER TABLE public.crm_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_restores ENABLE ROW LEVEL SECURITY;

-- Admin-only access (strict)
DROP POLICY IF EXISTS "Admins can view crm backups" ON public.crm_backups;
DROP POLICY IF EXISTS "Admins can create crm backups" ON public.crm_backups;
DROP POLICY IF EXISTS "Admins can update crm backups" ON public.crm_backups;
DROP POLICY IF EXISTS "Admins can delete crm backups" ON public.crm_backups;

CREATE POLICY "Admins can view crm backups"
ON public.crm_backups
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can create crm backups"
ON public.crm_backups
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update crm backups"
ON public.crm_backups
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete crm backups"
ON public.crm_backups
FOR DELETE
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view crm restores" ON public.crm_restores;
DROP POLICY IF EXISTS "Admins can create crm restores" ON public.crm_restores;
DROP POLICY IF EXISTS "Admins can update crm restores" ON public.crm_restores;
DROP POLICY IF EXISTS "Admins can delete crm restores" ON public.crm_restores;

CREATE POLICY "Admins can view crm restores"
ON public.crm_restores
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can create crm restores"
ON public.crm_restores
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update crm restores"
ON public.crm_restores
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete crm restores"
ON public.crm_restores
FOR DELETE
USING (public.is_admin());

-- 3) Storage bucket for backups (private)
-- Note: storage schema is managed, but adding buckets/policies is supported.
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-backups', 'crm-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins only
DROP POLICY IF EXISTS "Admins can read crm-backups objects" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert crm-backups objects" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update crm-backups objects" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete crm-backups objects" ON storage.objects;

CREATE POLICY "Admins can read crm-backups objects"
ON storage.objects
FOR SELECT
USING (bucket_id = 'crm-backups' AND public.is_admin());

CREATE POLICY "Admins can insert crm-backups objects"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'crm-backups' AND public.is_admin());

CREATE POLICY "Admins can update crm-backups objects"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'crm-backups' AND public.is_admin())
WITH CHECK (bucket_id = 'crm-backups' AND public.is_admin());

CREATE POLICY "Admins can delete crm-backups objects"
ON storage.objects
FOR DELETE
USING (bucket_id = 'crm-backups' AND public.is_admin());
