-- Dynamic Question Generation: new columns for assignments and submissions
-- Run this in Supabase SQL Editor

ALTER TABLE assignments
  ADD COLUMN dynamic_questions_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN dynamic_question_focuses jsonb,
  ADD COLUMN dynamic_generation_prompt text;

ALTER TABLE submissions
  ADD COLUMN generated_questions jsonb,
  ADD COLUMN generated_from_file_ids jsonb,
  ADD COLUMN questions_generated_at timestamptz;
