-- Migration to add experience rating columns to submissions table
-- Allows students to rate their assessment experience on a 1-5 scale with optional feedback

-- Add experience_rating column (1-5 scale)
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS experience_rating INTEGER CHECK (experience_rating >= 1 AND experience_rating <= 5);

-- Add experience_rating_feedback column (optional text feedback)
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS experience_rating_feedback TEXT;

-- Add comments
COMMENT ON COLUMN submissions.experience_rating IS 'Student experience rating on a 1-5 scale, collected at submission time';
COMMENT ON COLUMN submissions.experience_rating_feedback IS 'Optional text feedback explaining the experience rating';
