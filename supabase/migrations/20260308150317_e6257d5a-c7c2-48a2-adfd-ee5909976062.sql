
-- Performance targets (linked to automation thresholds)
CREATE TABLE public.performance_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  period TEXT NOT NULL,
  target_value DECIMAL(10,2) NOT NULL,
  set_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, metric_key, period)
);

ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view performance targets"
  ON public.performance_targets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert performance targets"
  ON public.performance_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update performance targets"
  ON public.performance_targets FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete performance targets"
  ON public.performance_targets FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Widget preferences per user per view
CREATE TABLE public.widget_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,
  widgets JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, view_type)
);

ALTER TABLE public.widget_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own widget preferences"
  ON public.widget_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can insert own widget preferences"
  ON public.widget_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own widget preferences"
  ON public.widget_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own widget preferences"
  ON public.widget_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Performance notes (admin-only annotations on staff performance)
CREATE TABLE public.staff_performance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id),
  note_type TEXT DEFAULT 'manual',
  note TEXT NOT NULL,
  metric_key TEXT,
  metric_value DECIMAL(10,2),
  created_by UUID REFERENCES public.profiles(id),
  period_ref TEXT,
  is_visible_to_staff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff_performance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage performance notes"
  ON public.staff_performance_notes FOR ALL
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Staff can view visible notes"
  ON public.staff_performance_notes FOR SELECT
  TO authenticated
  USING (staff_id = auth.uid() AND is_visible_to_staff = true);

-- Performance trigger log (audit trail)
CREATE TABLE public.performance_trigger_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_rule_id UUID,
  staff_id UUID REFERENCES public.profiles(id),
  trigger_metric TEXT,
  trigger_value DECIMAL(10,2),
  threshold_value DECIMAL(10,2),
  actions_fired JSONB,
  fired_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.performance_trigger_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view performance trigger log"
  ON public.performance_trigger_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "System can insert performance trigger log"
  ON public.performance_trigger_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
