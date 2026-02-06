-- Add instructions column to quizzes table
-- This field stores markdown-formatted instructions displayed to students below the quiz title
ALTER TABLE quizzes ADD COLUMN instructions text;
