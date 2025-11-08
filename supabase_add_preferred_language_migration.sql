-- Migration to add preferred_language column to classes and assignments tables

-- Add preferred_language to classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

-- Add comment explaining the preferred_language field
COMMENT ON COLUMN classes.preferred_language IS 'Preferred language for the class (e.g., "en", "ta", "de"). Should match language codes from supportedLanguages.ts';

-- Add preferred_language to assignments table
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

-- Add comment explaining the preferred_language field
COMMENT ON COLUMN assignments.preferred_language IS 'Preferred language for the assignment (e.g., "en", "ta", "de"). Defaults to the class preferred_language. Should match language codes from supportedLanguages.ts';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name IN ('classes', 'assignments') 
  AND column_name = 'preferred_language'
ORDER BY table_name, ordinal_position;

