-- ========================================
-- Keep in Touch (KIT) Module - Core Tables
-- ========================================

-- 1. KIT Touch Methods (Control Panel configurable)
CREATE TABLE public.kit_touch_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. KIT Outcomes (Control Panel configurable)
CREATE TABLE public.kit_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  requires_followup BOOLEAN DEFAULT false,
  is_positive BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. KIT Presets (Admin-managed touch sequence templates)
CREATE TABLE public.kit_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  touch_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_cycle_behavior TEXT DEFAULT 'user_defined' CHECK (default_cycle_behavior IN ('one_time', 'auto_repeat', 'user_defined')),
  is_active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. KIT Subscriptions (KIT activation on entities)
CREATE TABLE public.kit_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'customer', 'professional')),
  entity_id UUID NOT NULL,
  preset_id UUID REFERENCES public.kit_presets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  assigned_to TEXT NOT NULL,
  cycle_count INTEGER DEFAULT 1,
  max_cycles INTEGER,
  current_step INTEGER DEFAULT 0,
  pause_until TIMESTAMPTZ,
  pause_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. KIT Touches (Individual scheduled touch points)
CREATE TABLE public.kit_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.kit_subscriptions(id) ON DELETE CASCADE,
  sequence_index INTEGER NOT NULL,
  method TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  assigned_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'snoozed', 'skipped')),
  outcome TEXT,
  outcome_notes TEXT,
  completed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  reschedule_count INTEGER DEFAULT 0,
  original_scheduled_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================
-- Add KIT columns to entity tables
-- ========================================

ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS kit_subscription_id UUID REFERENCES public.kit_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_status TEXT DEFAULT 'none' CHECK (kit_status IN ('active', 'paused', 'none'));

ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS kit_subscription_id UUID REFERENCES public.kit_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_status TEXT DEFAULT 'none' CHECK (kit_status IN ('active', 'paused', 'none'));

ALTER TABLE public.professionals 
  ADD COLUMN IF NOT EXISTS kit_subscription_id UUID REFERENCES public.kit_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_status TEXT DEFAULT 'none' CHECK (kit_status IN ('active', 'paused', 'none'));

-- ========================================
-- Indexes for performance
-- ========================================

CREATE INDEX idx_kit_touches_scheduled ON public.kit_touches(scheduled_date, status);
CREATE INDEX idx_kit_touches_subscription ON public.kit_touches(subscription_id);
CREATE INDEX idx_kit_subscriptions_entity ON public.kit_subscriptions(entity_type, entity_id);
CREATE INDEX idx_kit_subscriptions_status ON public.kit_subscriptions(status);

-- ========================================
-- Updated_at triggers
-- ========================================

CREATE TRIGGER update_kit_touch_methods_updated_at
  BEFORE UPDATE ON public.kit_touch_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kit_outcomes_updated_at
  BEFORE UPDATE ON public.kit_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kit_presets_updated_at
  BEFORE UPDATE ON public.kit_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kit_subscriptions_updated_at
  BEFORE UPDATE ON public.kit_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kit_touches_updated_at
  BEFORE UPDATE ON public.kit_touches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- Enable RLS
-- ========================================

ALTER TABLE public.kit_touch_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_touches ENABLE ROW LEVEL SECURITY;

-- ========================================
-- RLS Policies
-- ========================================

-- kit_touch_methods: All authenticated users can read, admin can modify
CREATE POLICY "Anyone can read active touch methods" ON public.kit_touch_methods
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage touch methods" ON public.kit_touch_methods
  FOR ALL USING (public.is_admin());

-- kit_outcomes: All authenticated users can read, admin can modify
CREATE POLICY "Anyone can read outcomes" ON public.kit_outcomes
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage outcomes" ON public.kit_outcomes
  FOR ALL USING (public.is_admin());

-- kit_presets: All authenticated users can read active, admin can modify
CREATE POLICY "Anyone can read active presets" ON public.kit_presets
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins can manage presets" ON public.kit_presets
  FOR ALL USING (public.is_admin());

-- kit_subscriptions: All authenticated users can access
CREATE POLICY "Users can view all subscriptions" ON public.kit_subscriptions
  FOR SELECT USING (true);

CREATE POLICY "Users can create subscriptions" ON public.kit_subscriptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update subscriptions" ON public.kit_subscriptions
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete subscriptions" ON public.kit_subscriptions
  FOR DELETE USING (true);

-- kit_touches: All authenticated users can access
CREATE POLICY "Users can view all touches" ON public.kit_touches
  FOR SELECT USING (true);

CREATE POLICY "Users can create touches" ON public.kit_touches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update touches" ON public.kit_touches
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete touches" ON public.kit_touches
  FOR DELETE USING (true);

-- ========================================
-- Seed default touch methods
-- ========================================

INSERT INTO public.kit_touch_methods (value, label, icon, display_order) VALUES
  ('call', 'Phone Call', 'Phone', 1),
  ('whatsapp', 'WhatsApp', 'MessageCircle', 2),
  ('visit', 'Site Visit', 'MapPin', 3),
  ('email', 'Email', 'Mail', 4),
  ('meeting', 'Meeting', 'Users', 5);

-- ========================================
-- Seed default outcomes
-- ========================================

INSERT INTO public.kit_outcomes (value, label, requires_followup, is_positive, display_order) VALUES
  ('connected', 'Connected', false, true, 1),
  ('not_reachable', 'Not Reachable', true, false, 2),
  ('callback', 'Callback Requested', true, false, 3),
  ('positive', 'Positive Response', false, true, 4),
  ('invalid', 'Invalid Contact', false, false, 5);

-- ========================================
-- Enable realtime for kit_touches
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.kit_touches;