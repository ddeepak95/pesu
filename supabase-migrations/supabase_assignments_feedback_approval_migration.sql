-- Migration: Add feedback_requires_approval to assignments table
-- When true, AI-generated feedback is held pending teacher review before being shown to students.
-- The teacher can edit and approve feedback via the submissions view.
-- Defaults to false (instant feedback, preserving existing behaviour).

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS feedback_requires_approval boolean DEFAULT false;
