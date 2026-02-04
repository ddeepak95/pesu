-- Migration to add require_all_attempts column to assignments table
-- When true, students must attempt all questions before marking complete

-- Add require_all_attempts to assignments table
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS require_all_attempts BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the require_all_attempts field
COMMENT ON COLUMN assignments.require_all_attempts IS 'When true, students must attempt all questions before they can mark the assessment as complete.';
