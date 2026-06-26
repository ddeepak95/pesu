-- Normalized grading schema: tentative feedback, submission-level release, selected attempt.
--
-- Replaces the submissions.evaluations JSONB blob with a three-level table hierarchy
-- (submission_questions -> submission_attempts -> attempt_ai_evaluations) plus a
-- teacher-only review table. Adds the single release flag (feedback_released_at) and a
-- trigger-maintained graded_score rollup on submissions.
--
-- See dev-docs/teacher-approval-grading-flow.md (§4, §6 Phase 1).
-- No app code reads these tables yet; the legacy evaluations column stays intact.

-- ---------------------------------------------------------------------------
-- 1. submissions: release flag + denormalized counted total
-- ---------------------------------------------------------------------------
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS feedback_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_score numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.submissions.feedback_released_at IS
  'Single source of truth for tentative-vs-final: null = held/tentative, set = released. Reopen clears it.';
COMMENT ON COLUMN public.submissions.graded_score IS
  'Sum of submission_questions.released_score (selected attempt of released questions). Trigger-maintained.';

-- ---------------------------------------------------------------------------
-- 2. Tables (FKs ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id text NOT NULL REFERENCES public.submissions(submission_id) ON DELETE CASCADE,
  question_order int NOT NULL,
  selected_attempt_id uuid,            -- FK added after submission_attempts exists
  released_score numeric,              -- null until release
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_order)
);

CREATE TABLE IF NOT EXISTS public.submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_question_id uuid NOT NULL REFERENCES public.submission_questions(id) ON DELETE CASCADE,
  attempt_number int NOT NULL,
  max_score numeric NOT NULL DEFAULT 0,
  stale boolean NOT NULL DEFAULT false,
  score numeric,                       -- displayable grade (AI tentative -> teacher-final)
  feedback text,
  rubric_scores jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_question_id, attempt_number)
);

ALTER TABLE public.submission_questions
  DROP CONSTRAINT IF EXISTS submission_questions_selected_attempt_fk;
ALTER TABLE public.submission_questions
  ADD CONSTRAINT submission_questions_selected_attempt_fk
  FOREIGN KEY (selected_attempt_id) REFERENCES public.submission_attempts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.attempt_ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.submission_attempts(id) ON DELETE CASCADE,
  ai_score numeric,
  ai_feedback text,
  ai_rubric_scores jsonb,
  model_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submission_question_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_question_id uuid NOT NULL UNIQUE REFERENCES public.submission_questions(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS submission_questions_submission_idx
  ON public.submission_questions (submission_id);
CREATE INDEX IF NOT EXISTS submission_attempts_question_idx
  ON public.submission_attempts (submission_question_id);
CREATE INDEX IF NOT EXISTS submission_attempts_question_active_idx
  ON public.submission_attempts (submission_question_id) WHERE NOT stale;
-- (unique constraints already index (submission_id, question_order),
--  (submission_question_id, attempt_number), attempt_id, submission_question_id)

-- ---------------------------------------------------------------------------
-- 4. Rollup trigger: keep submissions.{graded_score,has_attempts,total_attempts,
--    questions_attempted_count,max_score} in sync. Counts use non-stale attempts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_submission_rollups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id text;
BEGIN
  IF TG_TABLE_NAME = 'submission_attempts' THEN
    SELECT sq.submission_id INTO v_submission_id
    FROM submission_questions sq
    WHERE sq.id = COALESCE(NEW.submission_question_id, OLD.submission_question_id);
  ELSE -- submission_questions
    v_submission_id := COALESCE(NEW.submission_id, OLD.submission_id);
  END IF;

  IF v_submission_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE submissions s SET
    graded_score = (
      SELECT COALESCE(SUM(sq.released_score), 0)
      FROM submission_questions sq
      WHERE sq.submission_id = v_submission_id
    ),
    total_attempts = (
      SELECT COUNT(*)
      FROM submission_questions sq
      JOIN submission_attempts sa ON sa.submission_question_id = sq.id
      WHERE sq.submission_id = v_submission_id AND sa.stale = false
    ),
    questions_attempted_count = (
      SELECT COUNT(DISTINCT sq.id)
      FROM submission_questions sq
      JOIN submission_attempts sa ON sa.submission_question_id = sq.id
      WHERE sq.submission_id = v_submission_id AND sa.stale = false
    ),
    has_attempts = EXISTS (
      SELECT 1
      FROM submission_questions sq
      JOIN submission_attempts sa ON sa.submission_question_id = sq.id
      WHERE sq.submission_id = v_submission_id AND sa.stale = false
    ),
    max_score = (
      SELECT COALESCE(SUM(per_q.mx), 0)
      FROM (
        SELECT MAX(sa.max_score) AS mx
        FROM submission_questions sq
        JOIN submission_attempts sa ON sa.submission_question_id = sq.id
        WHERE sq.submission_id = v_submission_id AND sa.stale = false
        GROUP BY sq.id
      ) per_q
    ),
    updated_at = now()
  WHERE s.submission_id = v_submission_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recompute_rollups_on_attempts ON public.submission_attempts;
CREATE TRIGGER recompute_rollups_on_attempts
  AFTER INSERT OR UPDATE OR DELETE ON public.submission_attempts
  FOR EACH ROW EXECUTE FUNCTION public.recompute_submission_rollups();

DROP TRIGGER IF EXISTS recompute_rollups_on_questions ON public.submission_questions;
CREATE TRIGGER recompute_rollups_on_questions
  AFTER INSERT OR UPDATE OR DELETE ON public.submission_questions
  FOR EACH ROW EXECUTE FUNCTION public.recompute_submission_rollups();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

-- 5a. Student-readable tables follow the existing submission-family convention
--     (USING(true) for authenticated + anon). The tentative grade is shown openly.
ALTER TABLE public.submission_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public to read submission_questions" ON public.submission_questions;
CREATE POLICY "Allow public to read submission_questions" ON public.submission_questions
  FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow public to create submission_questions" ON public.submission_questions;
CREATE POLICY "Allow public to create submission_questions" ON public.submission_questions
  FOR INSERT TO authenticated, anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public to update submission_questions" ON public.submission_questions;
CREATE POLICY "Allow public to update submission_questions" ON public.submission_questions
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public to read submission_attempts" ON public.submission_attempts;
CREATE POLICY "Allow public to read submission_attempts" ON public.submission_attempts
  FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow public to create submission_attempts" ON public.submission_attempts;
CREATE POLICY "Allow public to create submission_attempts" ON public.submission_attempts
  FOR INSERT TO authenticated, anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public to update submission_attempts" ON public.submission_attempts;
CREATE POLICY "Allow public to update submission_attempts" ON public.submission_attempts
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

-- 5b. Teacher-only lockdown helper (reused by both teacher-only policies).
CREATE OR REPLACE FUNCTION public.is_submission_teacher(p_submission_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM submissions s
    JOIN assignments a ON a.assignment_id = s.assignment_id
    WHERE s.submission_id = p_submission_id
      AND public.is_class_co_teacher(a.class_id)
  );
$$;

ALTER FUNCTION public.is_submission_teacher(text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.is_submission_teacher(text) TO anon;
GRANT ALL ON FUNCTION public.is_submission_teacher(text) TO authenticated;
GRANT ALL ON FUNCTION public.is_submission_teacher(text) TO service_role;

-- 5c. Teacher-only tables: audit (model_meta / original AI) + review progress.
ALTER TABLE public.attempt_ai_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_question_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage attempt ai evaluations" ON public.attempt_ai_evaluations;
CREATE POLICY "Teachers manage attempt ai evaluations" ON public.attempt_ai_evaluations
  FOR ALL TO authenticated
  USING (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_attempts sa
    JOIN submission_questions sq ON sq.id = sa.submission_question_id
    WHERE sa.id = attempt_ai_evaluations.attempt_id
  )))
  WITH CHECK (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_attempts sa
    JOIN submission_questions sq ON sq.id = sa.submission_question_id
    WHERE sa.id = attempt_ai_evaluations.attempt_id
  )));

DROP POLICY IF EXISTS "Teachers manage submission question reviews" ON public.submission_question_reviews;
CREATE POLICY "Teachers manage submission question reviews" ON public.submission_question_reviews
  FOR ALL TO authenticated
  USING (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_questions sq
    WHERE sq.id = submission_question_reviews.submission_question_id
  )))
  WITH CHECK (public.is_submission_teacher((
    SELECT sq.submission_id
    FROM submission_questions sq
    WHERE sq.id = submission_question_reviews.submission_question_id
  )));
