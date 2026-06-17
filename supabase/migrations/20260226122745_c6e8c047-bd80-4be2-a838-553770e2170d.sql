-- Remove duplicate trigger that causes double-firing
DROP TRIGGER IF EXISTS automation_trigger ON public.staff_activity_log;

-- Keep only automation_trigger_staff_activity (INSERT only, which is correct for activity logs)