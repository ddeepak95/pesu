-- Migration to update assignments table to support multiple questions
-- Run this if you already ran the previous migration

-- Step 1: Add the new questions column
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing data (if any) from old columns to questions array
-- This converts single prompt/rubric/supporting_content to a question array
UPDATE assignments
SET questions = jsonb_build_array(
  jsonb_build_object(
    'order', 0,
    'prompt', prompt,
    'total_points', total_points,
    'rubric', rubric,
    'supporting_content', COALESCE(supporting_content, '')
  )
)
WHERE questions = '[]'::jsonb;

-- Step 3: Drop old columns that are no longer needed
ALTER TABLE assignments 
DROP COLUMN IF EXISTS prompt,
DROP COLUMN IF EXISTS rubric,
DROP COLUMN IF EXISTS supporting_content;

-- Step 4: Add comment explaining the questions structure
COMMENT ON COLUMN assignments.questions IS 'Array of question objects, each containing: order, prompt, total_points, rubric (array), and supporting_content';

-- Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'assignments' 
ORDER BY ordinal_position;

