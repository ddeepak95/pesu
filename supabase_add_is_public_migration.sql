-- Migration to add is_public column to assignments table
-- This allows assignments to be shared publicly with non-authenticated users

-- Add is_public column to assignments table
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the is_public field
COMMENT ON COLUMN assignments.is_public IS 'Whether the assignment is publicly accessible via link (no authentication required)';

-- Add index for faster lookups of public assignments
CREATE INDEX IF NOT EXISTS idx_assignments_is_public ON assignments(is_public) WHERE is_public = true;

-- Update RLS policies to allow anonymous users to read public assignments
-- First, drop ALL existing SELECT policies to avoid conflicts
DROP POLICY IF EXISTS "Teachers can view their class assignments" ON assignments;
DROP POLICY IF EXISTS "Allow users to read their class assignments" ON assignments;
DROP POLICY IF EXISTS "Allow public read access to public assignments" ON assignments;

-- Create policy for anonymous users to read public assignments
CREATE POLICY "Allow public read access to public assignments"
ON assignments
FOR SELECT
TO anon
USING (
  is_public = true 
  AND status = 'active'
);

-- Create comprehensive policy for authenticated users
-- This replaces the original "Teachers can view their class assignments" policy
CREATE POLICY "Allow authenticated users to read assignments"
ON assignments
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND (
    -- Assignment is public (anyone can view)
    is_public = true
    OR
    -- User is the class owner
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
      AND classes.created_by = auth.uid()
    )
    OR
    -- User is a co-teacher
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = assignments.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  )
);

-- Verify the changes
SELECT 
  table_name, 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'assignments' 
  AND column_name = 'is_public'
ORDER BY ordinal_position;

