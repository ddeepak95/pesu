-- Migration to add star display settings columns to assignments table
-- Adds use_star_display, star_scale, and teacher_view_stars fields

-- Add use_star_display column to enable/disable star display for students
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS use_star_display BOOLEAN NOT NULL DEFAULT false;

-- Add star_scale column to set the number of stars in the scale
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS star_scale INTEGER DEFAULT 5;

-- Add teacher_view_stars column to control teacher's view preference
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS teacher_view_stars BOOLEAN NOT NULL DEFAULT false;

-- Add comments explaining the new fields
COMMENT ON COLUMN assignments.use_star_display IS 'Whether to show star ratings instead of points to students. Defaults to false.';
COMMENT ON COLUMN assignments.star_scale IS 'Number of stars in the rating scale (e.g., 5, 10, 20). Only applies when use_star_display is true. Defaults to 5.';
COMMENT ON COLUMN assignments.teacher_view_stars IS 'Whether the teacher views stars or points in their submissions view. Defaults to false (points).';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'assignments' 
  AND column_name IN ('use_star_display', 'star_scale', 'teacher_view_stars');
