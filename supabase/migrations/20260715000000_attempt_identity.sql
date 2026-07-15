-- Attempt identity: server-reserved attempt_id, merged into submission_attempts
-- (dev-docs/attempt-identity-plan.md). A submission_attempts row is now created
-- the moment a multimodal conversation starts (not just at grading), with grade
-- fields left null until evaluate() fills them in via UPDATE instead of INSERT.

-- ---------------------------------------------------------------------------
-- 1. graded_at: nullable, backfilled exact for existing rows (every existing
--    row was created only at grading time historically).
-- ---------------------------------------------------------------------------
alter table public.submission_attempts add column if not exists graded_at timestamptz;

update public.submission_attempts set graded_at = created_at where graded_at is null;

comment on column public.submission_attempts.created_at is
  'For rows created before this migration: when the attempt was graded. For rows created after: when the attempt (conversation) started — see graded_at for when grading finished.';
comment on column public.submission_attempts.graded_at is
  'When evaluate() finished grading this attempt. Null while the attempt is in progress (multimodal conversation started but not yet submitted/graded).';

-- Backs the RPC's in-progress-row lookup (step 3) — predicate matches exactly.
create index if not exists submission_attempts_in_progress_idx
  on public.submission_attempts (submission_question_id)
  where stale = false and graded_at is null and score is null;

-- ---------------------------------------------------------------------------
-- 2. Fix recompute_submission_rollups(): add the transition-safe "graded" gate
--    (graded_at IS NOT NULL OR score IS NOT NULL) so an ungraded in-progress
--    attempt row never counts as "attempted". The `OR score IS NOT NULL` half
--    keeps this safe regardless of migration/deploy ordering relative to the
--    evaluate/route.ts code deploy (see dev-docs/attempt-identity-plan.md
--    Phase A step 2 for the full deploy-window rationale) — keep permanently.
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
        AND (sa.graded_at IS NOT NULL OR sa.score IS NOT NULL)
    ),
    questions_attempted_count = (
      SELECT COUNT(DISTINCT sq.id)
      FROM submission_questions sq
      JOIN submission_attempts sa ON sa.submission_question_id = sq.id
      WHERE sq.submission_id = v_submission_id AND sa.stale = false
        AND (sa.graded_at IS NOT NULL OR sa.score IS NOT NULL)
    ),
    has_attempts = EXISTS (
      SELECT 1
      FROM submission_questions sq
      JOIN submission_attempts sa ON sa.submission_question_id = sq.id
      WHERE sq.submission_id = v_submission_id AND sa.stale = false
        AND (sa.graded_at IS NOT NULL OR sa.score IS NOT NULL)
    ),
    max_score = (
      SELECT COALESCE(SUM(per_q.mx), 0)
      FROM (
        SELECT MAX(sa.max_score) AS mx
        FROM submission_questions sq
        JOIN submission_attempts sa ON sa.submission_question_id = sq.id
        WHERE sq.submission_id = v_submission_id AND sa.stale = false
          AND (sa.graded_at IS NOT NULL OR sa.score IS NOT NULL)
        GROUP BY sq.id
      ) per_q
    ),
    updated_at = now()
  WHERE s.submission_id = v_submission_id;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. get_or_create_current_attempt: reuse the in-progress (ungraded, non-stale)
--    attempt for a question if one exists, else create a fresh one. Follows
--    this codebase's SELECT ... FOR UPDATE + IF NOT FOUND convention for
--    race-sensitive check-then-act (see accept_teacher_invite).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_current_attempt(
  p_submission_question_id uuid,
  p_max_score numeric
) RETURNS public.submission_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.submission_attempts%ROWTYPE;
  v_next integer;
BEGIN
  PERFORM 1 FROM submission_questions WHERE id = p_submission_question_id FOR UPDATE;

  -- Requires score IS NULL (not just graded_at IS NULL) so a fully-graded row
  -- inserted by the old evaluate() during a migration/deploy skew window
  -- (score set, graded_at never written) is never mistaken for an in-progress
  -- attempt and clobbered — see dev-docs/attempt-identity-plan.md Phase A step 3.
  SELECT * INTO v_row FROM submission_attempts
    WHERE submission_question_id = p_submission_question_id
      AND stale = false AND graded_at IS NULL AND score IS NULL
    LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next
    FROM submission_attempts WHERE submission_question_id = p_submission_question_id;

  INSERT INTO submission_attempts (submission_question_id, attempt_number, max_score, stale)
    VALUES (p_submission_question_id, v_next, p_max_score, false)
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_current_attempt(uuid, numeric) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. attempt_id columns: real FK now (unlike question_id, which has no
--    backing row) — on delete cascade for the four content tables +
--    attempt_sessions; on delete set null for ai_invocations (audit table,
--    matches its existing FK-nullable convention).
-- ---------------------------------------------------------------------------
alter table public.chat_messages          add column if not exists attempt_id uuid;
alter table public.voice_messages         add column if not exists attempt_id uuid;
alter table public.submission_transcripts add column if not exists attempt_id uuid;
alter table public.static_activity        add column if not exists attempt_id uuid;
alter table public.submission_session_audio add column if not exists attempt_id uuid;
alter table public.attempt_sessions       add column if not exists attempt_id uuid;
-- ai_invocations.attempt_id already exists (added, unbacked, in
-- 20260714020000_question_stable_ids.sql) — backfilled + constrained below.

-- ---------------------------------------------------------------------------
-- 5. Backfill attempt_id via join through submission_questions/
--    submission_attempts on (submission_id, question_id, attempt_number) —
--    same shape as the question_id backfill in the prior migration.
-- ---------------------------------------------------------------------------
create temporary table attempt_id_lookup as
select sq.submission_id, sq.question_id, sa.attempt_number, sa.id as attempt_id
from public.submission_questions sq
join public.submission_attempts sa on sa.submission_question_id = sq.id;

create index on attempt_id_lookup (submission_id, question_id, attempt_number);

update public.chat_messages cm
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = cm.submission_id and l.question_id = cm.question_id
  and l.attempt_number = cm.attempt_number and cm.attempt_id is null;

update public.voice_messages vm
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = vm.submission_id and l.question_id = vm.question_id
  and l.attempt_number = vm.attempt_number and vm.attempt_id is null;

update public.submission_transcripts st
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = st.submission_id and l.question_id = st.question_id
  and l.attempt_number = st.attempt_number and st.attempt_id is null;

update public.static_activity sa2
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = sa2.submission_id and l.question_id = sa2.question_id
  and l.attempt_number = sa2.attempt_number and sa2.attempt_id is null;

update public.submission_session_audio ssa
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = ssa.submission_id and l.question_id = ssa.question_id
  and l.attempt_number = ssa.attempt_number and ssa.attempt_id is null;

update public.attempt_sessions ats
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = ats.submission_id and l.question_id = ats.question_id
  and l.attempt_number = ats.attempt_number and ats.attempt_id is null;

update public.ai_invocations ai
set attempt_id = l.attempt_id
from attempt_id_lookup l
where l.submission_id = ai.submission_id and l.question_id = ai.question_id
  and l.attempt_number = ai.attempt_number and ai.attempt_id is null;

drop table attempt_id_lookup;

-- ---------------------------------------------------------------------------
-- 6. FK constraints (after backfill).
-- ---------------------------------------------------------------------------
alter table public.chat_messages
  add constraint chat_messages_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.voice_messages
  add constraint voice_messages_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.submission_transcripts
  add constraint submission_transcripts_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.static_activity
  add constraint static_activity_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.submission_session_audio
  add constraint submission_session_audio_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.attempt_sessions
  add constraint attempt_sessions_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete cascade;
alter table public.ai_invocations
  add constraint ai_invocations_attempt_id_fkey
  foreign key (attempt_id) references public.submission_attempts(id) on delete set null;

-- New unique constraints where "one row per attempt" already holds. NULLs are
-- distinct in Postgres unique constraints, so pre-existing orphan rows don't
-- violate these.
alter table public.submission_transcripts
  add constraint submission_transcripts_attempt_id_unique unique (attempt_id);
alter table public.static_activity
  add constraint static_activity_attempt_id_unique unique (attempt_id);

-- ---------------------------------------------------------------------------
-- 7. submission_attempts.session_id — the "winning session": which of an
--    attempt's (possibly several, one per page refresh) attempt_sessions rows
--    actually produced the graded answer. Left null for existing/historical
--    rows (no session existed before this pass); populated going forward only
--    at grading time, never at creation time.
-- ---------------------------------------------------------------------------
alter table public.submission_attempts
  add column if not exists session_id uuid references public.attempt_sessions(id) on delete set null;
