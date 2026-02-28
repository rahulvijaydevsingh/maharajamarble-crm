
ALTER TABLE public.salary_records
  ADD COLUMN IF NOT EXISTS days_lwp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_additions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_deductions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS finalized_by uuid;

CREATE POLICY "Admins can delete salary records"
ON public.salary_records FOR DELETE TO authenticated
USING (public.is_admin());
