ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS tab_leave_events jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS input_violation_events jsonb DEFAULT '[]'::jsonb;