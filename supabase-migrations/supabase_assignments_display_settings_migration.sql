-- Migration to add display settings columns to assignments table
-- Adds student_instructions, show_rubric, and show_rubric_points fields

-- Add student_instructions column for display-only instructions to students
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS student_instructions TEXT;

-- Add show_rubric column to control rubric visibility for students
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS show_rubric BOOLEAN NOT NULL DEFAULT true;

-- Add show_rubric_points column to control whether points are shown in rubric
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS show_rubric_points BOOLEAN NOT NULL DEFAULT true;

-- Add comments explaining the new fields
COMMENT ON COLUMN assignments.student_instructions IS 'Display-only instructions shown to students before they start the assessment. Not passed to the AI prompt.';
COMMENT ON COLUMN assignments.show_rubric IS 'Whether to show the rubric to students during the assessment. Defaults to true.';
COMMENT ON COLUMN assignments.show_rubric_points IS 'Whether to show rubric point values to students. Only applies when show_rubric is true. Defaults to true.';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'assignments' 
  AND column_name IN ('student_instructions', 'show_rubric', 'show_rubric_points');
