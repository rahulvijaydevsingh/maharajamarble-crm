
-- Add photo/flag/verified columns to attendance_records
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS clock_in_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS clock_out_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS clock_in_flag TEXT,
  ADD COLUMN IF NOT EXISTS clock_out_flag TEXT,
  ADD COLUMN IF NOT EXISTS clock_in_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_out_verified BOOLEAN DEFAULT false;

-- Create private storage bucket for attendance photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their own path
CREATE POLICY "Staff can upload own attendance photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS: staff can view own photos, admins can view all
CREATE POLICY "Staff can view own attendance photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'attendance-photos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin()));

-- Storage RLS: only admins can delete
CREATE POLICY "Admins can delete attendance photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attendance-photos' AND public.is_admin());

-- Allow staff to insert their own attendance record (for clock-in via edge function uses admin client, but also allow direct)
CREATE POLICY "Staff can insert own attendance"
ON attendance_records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = staff_id);

-- Allow staff to update their own attendance record (for clock-out)
CREATE POLICY "Staff can update own attendance"
ON attendance_records FOR UPDATE TO authenticated
USING (auth.uid() = staff_id);
