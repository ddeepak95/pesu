-- Migration: Add student_id and responder_details to submissions table
-- Supports both authenticated student submissions (via student_id) and public submissions (via responder_details)

-- Add student_id column for authenticated students
ALTER TABLE submissions 
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add responder_details JSONB column for storing responder information
ALTER TABLE submissions 
  ADD COLUMN IF NOT EXISTS responder_details JSONB DEFAULT NULL;

-- Make student_name nullable (will be migrated to responder_details)
ALTER TABLE submissions 
  ALTER COLUMN student_name DROP NOT NULL;

-- Migrate existing student_name to responder_details
UPDATE submissions 
SET responder_details = jsonb_build_object('name', student_name)
WHERE student_name IS NOT NULL AND responder_details IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_responder_details ON submissions USING GIN (responder_details);

-- Constraint: either student_id or responder_details must be provided
ALTER TABLE submissions 
  DROP CONSTRAINT IF EXISTS check_student_identifier;

ALTER TABLE submissions 
  ADD CONSTRAINT check_student_identifier 
  CHECK (student_id IS NOT NULL OR responder_details IS NOT NULL);

-- Update RLS policies to allow students to view their own submissions
DROP POLICY IF EXISTS "Students can view their own submissions" ON submissions;
CREATE POLICY "Students can view their own submissions" ON submissions
  FOR SELECT
  USING (
    student_id IS NOT NULL AND student_id = auth.uid()
    OR responder_details IS NOT NULL -- Public submissions accessible by anyone with submission_id
  );

-- Allow students to update their own submissions
DROP POLICY IF EXISTS "Students can update their own submissions" ON submissions;
CREATE POLICY "Students can update their own submissions" ON submissions
  FOR UPDATE
  USING (
    student_id IS NOT NULL AND student_id = auth.uid()
    OR responder_details IS NOT NULL -- Public submissions can be updated by anyone with submission_id
  )
  WITH CHECK (
    student_id IS NOT NULL AND student_id = auth.uid()
    OR responder_details IS NOT NULL
  );

