-- Add admin override audit fields to tasks (idempotent)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status_override text,
  ADD COLUMN IF NOT EXISTS status_override_reason text,
  ADD COLUMN IF NOT EXISTS status_override_by text,
  ADD COLUMN IF NOT EXISTS status_override_at timestamptz;

-- Ensure validation function exists (create if missing)
CREATE OR REPLACE FUNCTION public.validate_task_status_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  override_changed boolean;
BEGIN
  override_changed := (TG_OP = 'INSERT' AND NEW.status_override IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND (NEW.status_override IS DISTINCT FROM OLD.status_override));

  IF override_changed THEN
    -- Only admins may change status overrides
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can override task status';
    END IF;

    -- Reason is mandatory when changing override state (set or clear)
    IF NEW.status_override_reason IS NULL OR btrim(NEW.status_override_reason) = '' THEN
      RAISE EXCEPTION 'Override reason is required';
    END IF;

    -- Only allow non-completed statuses
    IF NEW.status_override IS NOT NULL AND NEW.status_override NOT IN ('Pending', 'In Progress', 'Overdue') THEN
      RAISE EXCEPTION 'Invalid status_override value';
    END IF;

    -- Cannot override a completed task (completion workflow owns that)
    IF NEW.completed_at IS NOT NULL OR NEW.status = 'Completed' THEN
      RAISE EXCEPTION 'Cannot override status for completed tasks';
    END IF;

    NEW.status_override_by := public.get_current_user_email();
    NEW.status_override_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_validate_task_status_override ON public.tasks;
CREATE TRIGGER trg_validate_task_status_override
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.validate_task_status_override();
