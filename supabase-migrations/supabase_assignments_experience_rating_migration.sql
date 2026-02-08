-- Migration to add experience rating configuration to assignments table
-- Teachers can enable/disable experience rating and choose whether it's required or skippable

-- Add experience_rating_enabled column (default false)
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS experience_rating_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add experience_rating_required column (default false)
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS experience_rating_required BOOLEAN NOT NULL DEFAULT false;

-- Add comments
COMMENT ON COLUMN assignments.experience_rating_enabled IS 'When true, students are asked to rate their experience when completing the assessment';
COMMENT ON COLUMN assignments.experience_rating_required IS 'When true, students must provide a rating before completing (otherwise they can skip)';
