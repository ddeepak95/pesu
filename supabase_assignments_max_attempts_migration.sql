-- Migration: Add max_attempts to assignments table
-- Allows teachers to configure how many attempts students can make per assignment

ALTER TABLE assignments 
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1 CHECK (max_attempts >= 1);

COMMENT ON COLUMN assignments.max_attempts IS 
  'Maximum number of attempts allowed per student for this assignment. Defaults to 1 (single attempt).';




