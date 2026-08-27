-- Migration: Backup, Retention & DR Foundation
-- Extends backup_jobs, creates backup_retention_settings & backup_deletion_log, renames legacy backup tables.

-- 1. Extend public.backup_jobs
ALTER TABLE public.backup_jobs
  ADD COLUMN IF NOT EXISTS backup_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT NULL,
  ADD COLUMN IF NOT EXISTS total_size_bytes BIGINT NULL,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER NULL,
  ADD COLUMN IF NOT EXISTS table_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS integrity_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pruned_at TIMESTAMPTZ NULL;

ALTER TABLE public.backup_jobs
  DROP CONSTRAINT IF EXISTS chk_backup_tier,
  DROP CONSTRAINT IF EXISTS chk_integrity_status,
  DROP CONSTRAINT IF EXISTS chk_backup_jobs_status,
  DROP CONSTRAINT IF EXISTS backup_jobs_status_check;

ALTER TABLE public.backup_jobs
  ADD CONSTRAINT chk_backup_tier CHECK (backup_tier IN ('daily', 'weekly', 'monthly') OR backup_tier IS NULL),
  ADD CONSTRAINT chk_integrity_status CHECK (integrity_status IN ('pending', 'valid', 'failed')),
  ADD CONSTRAINT chk_backup_jobs_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'pruned', 'manually_deleted'));

CREATE INDEX IF NOT EXISTS idx_backup_jobs_retention_eval
  ON public.backup_jobs (status, is_pinned, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_tier_created
  ON public.backup_jobs (backup_tier, created_at DESC)
  WHERE status = 'completed';

-- 2. Create public.backup_retention_settings (singleton config)
CREATE TABLE IF NOT EXISTS public.backup_retention_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  daily_keep INTEGER NOT NULL DEFAULT 7 CHECK (daily_keep >= 1),
  weekly_keep INTEGER NOT NULL DEFAULT 4 CHECK (weekly_keep >= 1),
  monthly_keep INTEGER NOT NULL DEFAULT 6 CHECK (monthly_keep >= 1),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  cron_secret TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT NULL
);

INSERT INTO public.backup_retention_settings (id, daily_keep, weekly_keep, monthly_keep, is_enabled)
VALUES (true, 7, 4, 6, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.backup_retention_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read backup settings" ON public.backup_retention_settings;
CREATE POLICY "Allow authenticated users to read backup settings"
  ON public.backup_retention_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow admins to update backup settings" ON public.backup_retention_settings;
CREATE POLICY "Allow admins to update backup settings"
  ON public.backup_retention_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Create public.backup_deletion_log (append-only audit)
CREATE TABLE IF NOT EXISTS public.backup_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_job_id UUID REFERENCES public.backup_jobs(id) ON DELETE SET NULL,
  backup_tier TEXT NULL,
  backup_created_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by TEXT NOT NULL,
  deletion_reason TEXT NOT NULL CHECK (deletion_reason IN ('retention', 'manual')),
  files_deleted TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
);

ALTER TABLE public.backup_deletion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to view backup deletion logs" ON public.backup_deletion_log;
CREATE POLICY "Allow admins to view backup deletion logs"
  ON public.backup_deletion_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Allow service-role / admins to insert deletion logs" ON public.backup_deletion_log;
CREATE POLICY "Allow service-role / admins to insert deletion logs"
  ON public.backup_deletion_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 4. Retire the legacy pair
ALTER TABLE IF EXISTS public.crm_backups RENAME TO crm_backups_legacy;
ALTER TABLE IF EXISTS public.crm_restores RENAME TO crm_restores_legacy;
