-- Activity Preview ("Save and Preview")
-- Adds a marker that flags a submission as a teacher preview run.
-- Preview submissions exercise the real student pipeline (evaluation, transcripts,
-- attempts, files) against the real assignment row, but must be excluded from every
-- submission read surface (teacher view, public view, pending-approval badges,
-- analytics). Default false so all existing rows are unaffected.

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;

-- Partial index: the common case is "real submissions only" (is_preview = false),
-- which Postgres can serve from this index when filtering preview rows out.
CREATE INDEX IF NOT EXISTS idx_submissions_is_preview
  ON public.submissions (is_preview)
  WHERE is_preview = true;
