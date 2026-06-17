-- Drop the overly-restrictive CHECK constraint on reminders.recurrence_pattern
-- The UI builds extended patterns like "weekly;interval:1;days:mon,wed" which the old
-- constraint rejected, causing recurring reminder saves to fail silently.
ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_recurrence_pattern_check;
