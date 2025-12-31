-- Add 'draft' status to assignments.status
-- Run this after your assignments table exists.

-- Drop the old CHECK constraint (generated name is usually assignments_status_check)
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_status_check;

-- Re-add with draft support
ALTER TABLE assignments
  ADD CONSTRAINT assignments_status_check
  CHECK (status IN ('draft', 'active', 'deleted'));


