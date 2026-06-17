
-- Create staff_activity_log table
CREATE TABLE public.staff_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action_type text NOT NULL,
  action_description text,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view all staff activity
CREATE POLICY "Admins can view all staff activity" ON public.staff_activity_log
  FOR SELECT USING (public.is_admin());

-- Authenticated users can insert their own activity
CREATE POLICY "Users can log own activity" ON public.staff_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can delete old logs
CREATE POLICY "Admins can delete staff activity" ON public.staff_activity_log
  FOR DELETE USING (public.is_admin());

-- Index for fast lookups
CREATE INDEX idx_staff_activity_log_user_id ON public.staff_activity_log(user_id);
CREATE INDEX idx_staff_activity_log_action_type ON public.staff_activity_log(action_type);
CREATE INDEX idx_staff_activity_log_created_at ON public.staff_activity_log(created_at DESC);
