-- Drop deprecated student_name column from submissions
-- Display names are now derived from:
--   Authenticated students: student_id -> user profile
--   Public responders: responder_details JSONB
ALTER TABLE public.submissions DROP COLUMN IF EXISTS student_name;
