-- Migration: Add bot_prompt_config column to assignments table
-- This column stores AI bot behavior configuration for voice and chat assessment modes

-- Add the new JSONB column
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS bot_prompt_config JSONB DEFAULT NULL;

-- Add comment describing the structure
COMMENT ON COLUMN assignments.bot_prompt_config IS 
'Configuration for AI bot behavior (voice and chat modes). Structure: {
  system_prompt: string (with variable placeholders like {{language}}, {{question_prompt}}, {{rubric}}),
  conversation_start: { first_question: string, subsequent_questions: string },
  question_overrides: { [questionOrder]: { system_prompt?, conversation_start? } }
}';

-- Create an index for assignments that have bot_prompt_config set (for potential filtering)
CREATE INDEX IF NOT EXISTS idx_assignments_has_bot_prompt_config 
ON assignments ((bot_prompt_config IS NOT NULL))
WHERE bot_prompt_config IS NOT NULL;
