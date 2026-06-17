
-- ============================================================
-- PART A: system_settings table
-- ============================================================
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_module_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  hr_module_toggled_by UUID REFERENCES public.profiles(id),
  hr_module_toggled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view system settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert system settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update system settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Seed default row
INSERT INTO public.system_settings (hr_module_enabled) VALUES (FALSE);

-- updated_at trigger
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART B: HR Tables
-- ============================================================

-- 1. staff_hr_settings
CREATE TABLE public.staff_hr_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_salary NUMERIC DEFAULT 0,
  salary_type TEXT NOT NULL DEFAULT 'monthly',
  shift_start TIME,
  shift_end TIME,
  work_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat'],
  gps_required BOOLEAN DEFAULT FALSE,
  office_latitude DOUBLE PRECISION,
  office_longitude DOUBLE PRECISION,
  gps_radius_meters INTEGER DEFAULT 100,
  overtime_rate NUMERIC DEFAULT 1.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id)
);

ALTER TABLE public.staff_hr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own HR settings"
  ON public.staff_hr_settings FOR SELECT TO authenticated
  USING (auth.uid() = staff_id OR public.is_admin());

CREATE POLICY "Admins can insert HR settings"
  ON public.staff_hr_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update HR settings"
  ON public.staff_hr_settings FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete HR settings"
  ON public.staff_hr_settings FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_staff_hr_settings_updated_at
  BEFORE UPDATE ON public.staff_hr_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. attendance_records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  clock_in_latitude DOUBLE PRECISION,
  clock_in_longitude DOUBLE PRECISION,
  clock_out_latitude DOUBLE PRECISION,
  clock_out_longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'present',
  total_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  notes TEXT,
  created_by TEXT DEFAULT public.get_current_user_email(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (auth.uid() = staff_id OR public.is_admin());

CREATE POLICY "Admins can insert attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update attendance"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. leave_requests
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'casual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own leave requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (auth.uid() = staff_id OR public.is_admin());

CREATE POLICY "Staff can insert own leave requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Admins can update leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. leave_balances
CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'casual',
  total_allowed NUMERIC NOT NULL DEFAULT 0,
  used NUMERIC NOT NULL DEFAULT 0,
  remaining NUMERIC NOT NULL DEFAULT 0,
  carry_forward NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, year, leave_type)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own leave balances"
  ON public.leave_balances FOR SELECT TO authenticated
  USING (auth.uid() = staff_id OR public.is_admin());

CREATE POLICY "Admins can insert leave balances"
  ON public.leave_balances FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update leave balances"
  ON public.leave_balances FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete leave balances"
  ON public.leave_balances FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. work_delegations
CREATE TABLE public.work_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delegatee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT DEFAULT public.get_current_user_email(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own delegations"
  ON public.work_delegations FOR SELECT TO authenticated
  USING (auth.uid() = delegator_id OR auth.uid() = delegatee_id OR public.is_admin());

CREATE POLICY "Admins can insert delegations"
  ON public.work_delegations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update delegations"
  ON public.work_delegations FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_work_delegations_updated_at
  BEFORE UPDATE ON public.work_delegations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. salary_records
CREATE TABLE public.salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  base_salary NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  deductions NUMERIC DEFAULT 0,
  bonuses NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  total_working_days INTEGER DEFAULT 0,
  days_present INTEGER DEFAULT 0,
  days_absent INTEGER DEFAULT 0,
  days_leave INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  generated_by UUID REFERENCES public.profiles(id),
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, month, year)
);

ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own salary records"
  ON public.salary_records FOR SELECT TO authenticated
  USING (auth.uid() = staff_id OR public.is_admin());

CREATE POLICY "Admins can insert salary records"
  ON public.salary_records FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update salary records"
  ON public.salary_records FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_salary_records_updated_at
  BEFORE UPDATE ON public.salary_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. public_holidays
CREATE TABLE public.public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  is_optional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view holidays"
  ON public.public_holidays FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert holidays"
  ON public.public_holidays FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update holidays"
  ON public.public_holidays FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete holidays"
  ON public.public_holidays FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER update_public_holidays_updated_at
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
