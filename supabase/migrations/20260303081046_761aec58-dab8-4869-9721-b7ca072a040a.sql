
-- ① Additions to existing leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_approved_by UUID,
  ADD COLUMN IF NOT EXISTS pending_lost_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS cooling_off_due_date DATE,
  ADD COLUMN IF NOT EXISTS previous_lead_id UUID REFERENCES public.leads(id),
  ADD COLUMN IF NOT EXISTS previous_phone_match BOOLEAN DEFAULT FALSE;

-- ② Additions to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- ③ Create lead_lost_reasons configuration table
CREATE TABLE IF NOT EXISTS public.lead_lost_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_key TEXT NOT NULL UNIQUE,
  reason_label TEXT NOT NULL,
  cooling_off_days INTEGER DEFAULT 90,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.lead_lost_reasons ENABLE ROW LEVEL SECURITY;

-- RLS: everyone can read, admins can manage
CREATE POLICY "Anyone can read lost reasons"
  ON public.lead_lost_reasons FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage lost reasons"
  ON public.lead_lost_reasons FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ④ Seed default lost reasons
INSERT INTO public.lead_lost_reasons (reason_key, reason_label, cooling_off_days, sort_order) VALUES
  ('price_too_high', 'Price Too High', 90, 1),
  ('chose_competitor', 'Chose Competitor', 180, 2),
  ('project_cancelled', 'Project Cancelled', 180, 3),
  ('not_responding', 'Not Responding', 90, 4),
  ('not_interested', 'Not Interested', 365, 5),
  ('budget_constraint', 'Budget Constraint', 90, 6),
  ('duplicate', 'Duplicate Lead', NULL, 7),
  ('other', 'Other', 90, 8)
ON CONFLICT (reason_key) DO NOTHING;

-- ⑤ Add can_delete_leads permission to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_delete_leads BOOLEAN DEFAULT FALSE;
