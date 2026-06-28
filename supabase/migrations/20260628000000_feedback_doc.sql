-- Structured block-based AI feedback (see dev-docs/structured-block-feedback.md).
--
-- Feedback gains an optional structured "document" alongside the existing flat
-- `feedback` (text) and `rubric_scores` (jsonb) columns. The document is the
-- whitelisted block union (FeedbackDoc); `feedback` stays populated as a
-- flattened plain-text rendering for backward compat / search / legacy fallback,
-- and `rubric_scores` remains the grading source of truth.
--
-- All columns are nullable: old/legacy attempts have null feedback_doc and keep
-- rendering as plain text.

-- Student-visible structured document.
ALTER TABLE public.submission_attempts
  ADD COLUMN IF NOT EXISTS feedback_doc jsonb;

COMMENT ON COLUMN public.submission_attempts.feedback_doc IS
  'Structured block-based feedback document (FeedbackDoc). Null for legacy attempts; the flat `feedback` text column mirrors it for fallback/search.';

-- AI audit copy (parallels ai_feedback / ai_rubric_scores).
ALTER TABLE public.attempt_ai_evaluations
  ADD COLUMN IF NOT EXISTS ai_feedback_doc jsonb;

COMMENT ON COLUMN public.attempt_ai_evaluations.ai_feedback_doc IS
  'Original AI-generated structured feedback document (audit copy of feedback_doc at generation time).';

-- Teacher draft of the structured document (parallels draft_feedback).
ALTER TABLE public.attempt_grade_drafts
  ADD COLUMN IF NOT EXISTS draft_feedback_doc jsonb;

COMMENT ON COLUMN public.attempt_grade_drafts.draft_feedback_doc IS
  'Teacher-edited structured feedback document, unpublished. Copied into submission_attempts.feedback_doc on release.';

-- Teacher "Feedback focus" areas, fed into the evaluation prompt to steer the
-- AI's feedback sections. jsonb array of { title, description }: each title
-- becomes a feedback section title; the description steers what it covers.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS feedback_focus jsonb;

COMMENT ON COLUMN public.assignments.feedback_focus IS
  'Teacher feedback-focus areas: jsonb array of { title, description }. Each title becomes a feedback_doc section title; the description steers what that section covers. Null = no specific focus.';
