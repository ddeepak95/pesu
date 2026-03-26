-- Add activity_type column to assignments table.
-- Values: 'learning' (default) or 'assessment'.
-- Existing rows get 'learning' since that is now the default activity type.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'learning';
