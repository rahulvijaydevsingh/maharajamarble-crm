-- Allow deletion reasons emitted by the scheduled backup retention
-- function and the verified failed-prefix cleanup workflow.
ALTER TABLE public.backup_deletion_log
  DROP CONSTRAINT IF EXISTS backup_deletion_log_deletion_reason_check;

ALTER TABLE public.backup_deletion_log
  ADD CONSTRAINT backup_deletion_log_deletion_reason_check
  CHECK (
    deletion_reason = ANY (ARRAY[
      'retention'::text,
      'manual'::text,
      'failed_job_cleanup'::text,
      'stale_processing_cleanup'::text
    ])
  );
