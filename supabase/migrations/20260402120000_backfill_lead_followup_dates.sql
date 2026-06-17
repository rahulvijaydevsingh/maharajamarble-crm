-- Backfill last_follow_up from most recent completed task or activity
UPDATE leads l
SET last_follow_up = GREATEST(
  COALESCE((SELECT MAX(t.completed_at) FROM tasks t
   WHERE t.lead_id = l.id AND t.status = 'Completed'), '1900-01-01'::timestamptz),
  COALESCE((SELECT MAX(a.created_at) FROM activity_log a
   WHERE a.lead_id = l.id AND a.activity_type IN ('call', 'site_visit', 'meeting', 'whatsapp_sent', 'email_sent', 'follow_up_completed', 'note_added')), '1900-01-01'::timestamptz)
)
WHERE l.status NOT IN ('lost', 'deleted');

-- Clean up the '1900-01-01' sentinel if both were null
UPDATE leads SET last_follow_up = NULL WHERE last_follow_up = '1900-01-01'::timestamptz;

-- Backfill next_follow_up from earliest pending task
UPDATE leads l
SET next_follow_up = (
  SELECT MIN(t.due_date)::timestamptz FROM tasks t
  WHERE t.lead_id = l.id
  AND t.status IN ('Pending', 'In Progress')
)
WHERE l.status NOT IN ('lost', 'deleted');
