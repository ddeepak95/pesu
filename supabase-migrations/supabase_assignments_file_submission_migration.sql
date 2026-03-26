-- Add file_submission_config JSONB column to assignments table.
-- Stores configuration for file upload requirements:
-- { required, allow_multiple, instructions, allowed_file_types }

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS file_submission_config JSONB DEFAULT NULL;

COMMENT ON COLUMN assignments.file_submission_config IS
  'JSONB config for file submission: { required: bool, allow_multiple: bool, instructions?: string, allowed_file_types?: string[] }';
