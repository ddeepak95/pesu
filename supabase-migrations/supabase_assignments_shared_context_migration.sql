-- Migration: Add shared context and custom evaluation prompt columns to assignments table
-- shared_context_enabled: toggle for shared context feature
-- shared_context: the shared context text (case study, passage, scenario)
-- evaluation_prompt: custom evaluation prompt template

-- Add shared_context_enabled column
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS shared_context_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add shared_context column
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS shared_context TEXT;

-- Add evaluation_prompt column
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS evaluation_prompt TEXT;

-- Add comments explaining the new fields
COMMENT ON COLUMN assignments.shared_context_enabled IS 'When true, a shared context is shown to students and included in all AI prompts. Defaults to false.';
COMMENT ON COLUMN assignments.shared_context IS 'The shared context text (e.g. a case study, passage, scenario). Only used when shared_context_enabled is true.';
COMMENT ON COLUMN assignments.evaluation_prompt IS 'Custom evaluation prompt template. If set, replaces the hardcoded evaluation prompt. Supports placeholders: {{language}}, {{question_prompt}}, {{rubric}}, {{answer_text}}, {{shared_context}}.';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'assignments'
  AND column_name IN ('shared_context_enabled', 'shared_context', 'evaluation_prompt');
