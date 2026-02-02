-- Migration to add lock_language column to assignments table
-- When lock_language is true, students cannot change the language during the assessment

-- Add lock_language to assignments table
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS lock_language BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the lock_language field
COMMENT ON COLUMN assignments.lock_language IS 'When true, students cannot change the interaction language during the assessment. The language is fixed to preferred_language.';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'assignments' 
  AND column_name = 'lock_language';
