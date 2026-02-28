
-- Add missing columns to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS admin_comment TEXT,
  ADD COLUMN IF NOT EXISTS half_day_type TEXT,
  ADD COLUMN IF NOT EXISTS document_url TEXT;

-- Delete policy for cancelling pending requests
CREATE POLICY "Staff can delete own pending leave requests"
ON public.leave_requests FOR DELETE TO authenticated
USING (auth.uid() = staff_id AND status = 'pending');
