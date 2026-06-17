ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS clock_in_latitude  DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_longitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_latitude  DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_longitude DECIMAL(9,6);