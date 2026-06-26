-- Teacher grade drafts + assignment-level release gate.
--
-- 1. attempt_grade_drafts: a teacher-only "working copy" of an attempt's grade.
--    The teacher edits here (Save draft) without touching the student-visible
--    submission_attempts columns. Release/Publish copies the draft into
--    submission_attempts and deletes the draft row. Mirrors attempt_ai_evaluations
--    (teacher-only RLS via is_submission_teacher).
--
-- 2. assignments.batch_grade_release + grades_released_at: the assignment-level
--    gate. In batch mode, a finalized submission stays hidden from the student
--    until the teacher opens the gate (grades_released_at set), revealing every
--    finalized submission at once.
--
-- See dev-docs/teacher-approval-grading-flow.md and the plan
-- (playful-twirling-lemur): draft -> release flow.

-- ---------------------------------------------------------------------------
-- 1. Teacher-only draft table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attempt_grade_drafts (
  attempt_id uuid PRIMARY KEY REFERENCES public.submission_attempts(id) ON DELETE CASCADE,
  draft_score numeric,
  draft_feedback text,
  draft_rubric_scores jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.attempt_grade_drafts IS
  'Teacher-only unpublished grade edits per attempt. Presence of a row = pending draft. Cleared on release/publish.';

ALTER TABLE public.attempt_grade_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage attempt grade drafts" ON public.attempt_grade_drafts;
CREATE POLICY "Teachers manage attempt grade drafts" ON public.attempt_grade_drafts
  FOR ALL TO authenticated
  USING (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_attempts sa
    JOIN submission_questions sq ON sq.id = sa.submission_question_id
    WHERE sa.id = attempt_grade_drafts.attempt_id
  )))
  WITH CHECK (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_attempts sa
    JOIN submission_questions sq ON sq.id = sa.submission_question_id
    WHERE sa.id = attempt_grade_drafts.attempt_id
  )));

-- ---------------------------------------------------------------------------
-- 2. Assignment-level release gate
-- ---------------------------------------------------------------------------
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS batch_grade_release boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grades_released_at timestamptz;

COMMENT ON COLUMN public.assignments.batch_grade_release IS
  'true = "hold all, release together": finalized submissions stay hidden until grades_released_at is set. false = release each student as graded.';
COMMENT ON COLUMN public.assignments.grades_released_at IS
  'Assignment-level release gate. When batch_grade_release is true, students see finalized grades only once this is set (null = held).';
