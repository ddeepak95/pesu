-- Add file_ids column to submissions table.
-- Stores UUIDs of associated submission_files rows for quick lookup.

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS file_ids UUID[] DEFAULT NULL;
