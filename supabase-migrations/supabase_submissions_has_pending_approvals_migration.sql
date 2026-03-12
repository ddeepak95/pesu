-- Migration: Add has_pending_approvals to submissions table
-- Denormalized boolean that is true when at least one attempt across all
-- questions has feedback_approved = false AND is_evaluating = false.
-- Updated alongside other denormalized columns on every evaluate / approve write.
-- Defaults to false so existing rows are unaffected.

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS has_pending_approvals boolean DEFAULT false;
