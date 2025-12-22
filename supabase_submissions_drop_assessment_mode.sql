-- Migration: Drop assessment_mode column from submissions table
-- This column was created but we're using submission_mode instead
-- Run this if you already ran the assessment_mode migration

-- Drop the index first (if it exists)
DROP INDEX IF EXISTS idx_submissions_assessment_mode;

-- Drop the column
ALTER TABLE submissions 
  DROP COLUMN IF EXISTS assessment_mode;

-- Verify the column was dropped
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'submissions' 
  AND column_name = 'assessment_mode';

