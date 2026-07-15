-- Stable question ids + attempt session ids (dev-docs/question-stable-ids-plan.md)
--
-- Purely additive: new nullable columns, backfill, new unique constraints
-- alongside the old ones. Nothing dropped. Legacy question_order columns and
-- constraints are left in place for a deferred future cleanup migration.

-- ---------------------------------------------------------------------------
-- 1. New columns (all nullable, no FK — mirrors how question_order itself has
--    no FK today, since the id lives inside a jsonb array element, not a
--    relational row).
-- ---------------------------------------------------------------------------
alter table public.submission_questions       add column if not exists question_id uuid;
alter table public.chat_messages               add column if not exists question_id uuid;
alter table public.voice_messages              add column if not exists question_id uuid;
alter table public.submission_transcripts      add column if not exists question_id uuid;
alter table public.static_activity             add column if not exists question_id uuid;
alter table public.submission_session_audio    add column if not exists question_id uuid;
alter table public.ai_invocations              add column if not exists question_id uuid;
alter table public.ai_invocations              add column if not exists attempt_id  uuid;
alter table public.app_logs                    add column if not exists question_id uuid;
alter table public.attempt_ai_evaluations       add column if not exists ai_invocation_id uuid references public.ai_invocations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Backfill assignments.questions[*].id and submissions.generated_questions[*].id
--    — idempotent (guarded by `elem ? 'id'`).
-- ---------------------------------------------------------------------------
update public.assignments
set questions = (
  select jsonb_agg(
    case when elem ? 'id' then elem
         else elem || jsonb_build_object('id', gen_random_uuid()::text)
    end order by ord
  )
  from jsonb_array_elements(questions) with ordinality as t(elem, ord)
)
where questions is not null and jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) > 0;

update public.submissions
set generated_questions = (
  select jsonb_agg(
    case when elem ? 'id' then elem
         else elem || jsonb_build_object('id', gen_random_uuid()::text)
    end order by ord
  )
  from jsonb_array_elements(generated_questions) with ordinality as t(elem, ord)
)
where generated_questions is not null and jsonb_typeof(generated_questions) = 'array' and jsonb_array_length(generated_questions) > 0;

-- ---------------------------------------------------------------------------
-- 3. Rekey bot_prompt_config.question_overrides (order-index keys -> id keys).
--    Must run after step 2, same migration/transaction. A stale override key
--    pointing at an out-of-range index is silently dropped (matches current
--    inert behavior).
-- ---------------------------------------------------------------------------
with question_id_map as (
  select a.id as assignment_pk, (ord - 1)::int as question_order, (elem->>'id') as question_id
  from public.assignments a, jsonb_array_elements(a.questions) with ordinality as t(elem, ord)
  where a.bot_prompt_config ? 'question_overrides'
),
remapped as (
  select a.id as assignment_pk, jsonb_object_agg(qim.question_id, ov.value) as new_overrides
  from public.assignments a
  join jsonb_each(a.bot_prompt_config->'question_overrides') as ov(key, value) on true
  join question_id_map qim on qim.assignment_pk = a.id and qim.question_order = (ov.key)::int
  where a.bot_prompt_config ? 'question_overrides'
  group by a.id
)
update public.assignments a
set bot_prompt_config = jsonb_set(a.bot_prompt_config, '{question_overrides}', r.new_overrides, true)
from remapped r
where r.assignment_pk = a.id;

-- ---------------------------------------------------------------------------
-- 4. Backfill submission_questions.question_id / chat_messages.question_id /
--    etc. Source array is coalesce(submission.generated_questions,
--    assignment.questions) — mirrors the client's own resolution
--    (AssignmentResponseCore.tsx's sortedQuestions).
-- ---------------------------------------------------------------------------
create temporary table question_id_lookup as
with submission_question_source as (
  select s.submission_id, coalesce(s.generated_questions, a.questions) as questions
  from public.submissions s
  left join public.assignments a on a.assignment_id = s.assignment_id
)
select sqs.submission_id, (ord - 1)::int as question_order, (elem->>'id')::uuid as question_id
from submission_question_source sqs, jsonb_array_elements(sqs.questions) with ordinality as t(elem, ord)
where sqs.questions is not null;

create index on question_id_lookup (submission_id, question_order);

update public.submission_questions sq
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = sq.submission_id and qil.question_order = sq.question_order and sq.question_id is null;

update public.chat_messages cm
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = cm.submission_id and qil.question_order = cm.question_order and cm.question_id is null;

update public.voice_messages vm
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = vm.submission_id and qil.question_order = vm.question_order and vm.question_id is null;

update public.submission_transcripts st
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = st.submission_id and qil.question_order = st.question_order and st.question_id is null;

update public.static_activity sa
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = sa.submission_id and qil.question_order = sa.question_order and sa.question_id is null;

update public.submission_session_audio ssa
set question_id = qil.question_id
from question_id_lookup qil
where qil.submission_id = ssa.submission_id and qil.question_order = ssa.question_order and ssa.question_id is null;

-- ai_invocations/app_logs backfill is optional/low-priority — leave NULL for
-- historical rows, rely on question_order for historical audit lookups.

drop table question_id_lookup;

-- ---------------------------------------------------------------------------
-- 5. New unique constraints (after backfill; old constraints stay untouched).
--    NULLs are distinct in Postgres unique constraints, so pre-existing
--    orphan rows don't violate these.
-- ---------------------------------------------------------------------------
alter table public.submission_questions   add constraint submission_questions_question_id_unique unique (submission_id, question_id);
alter table public.submission_transcripts add constraint submission_transcripts_question_id_unique unique (submission_id, question_id, attempt_number);
alter table public.static_activity        add constraint static_activity_question_id_unique unique (submission_id, question_id, attempt_number);

-- =============================================================================
-- Addition: attempt_session_id (distinguish refreshed/abandoned sessions from
-- continuous ones). Foundational data capture only — no abandonment-detection
-- logic or resume UI built in this pass.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6. New table: attempt_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.attempt_sessions (
  id uuid primary key,                 -- client-minted (crypto.randomUUID()), not server-generated
  submission_id text not null references public.submissions(submission_id) on delete cascade,
  question_id uuid,                    -- no FK, same reasoning as question_id elsewhere (lives in a jsonb array, not a row)
  attempt_number integer not null,
  started_at timestamptz not null default now()
);
create index if not exists attempt_sessions_submission_idx
  on public.attempt_sessions (submission_id, question_id, attempt_number);

alter table public.attempt_sessions enable row level security;
-- Mirror the existing permissive convention on chat_messages/submission_transcripts
-- (same migration, remote_schema.sql:3930-3978) — actual access control for a
-- submission is enforced elsewhere in the app, not via RLS on these interaction tables.
drop policy if exists "Allow public to create attempt sessions" on public.attempt_sessions;
create policy "Allow public to create attempt sessions" on public.attempt_sessions
  for insert to authenticated, anon with check (true);
drop policy if exists "Allow public to read attempt sessions" on public.attempt_sessions;
create policy "Allow public to read attempt sessions" on public.attempt_sessions
  for select to authenticated, anon using (true);

-- ---------------------------------------------------------------------------
-- 7. New column: session_id uuid, added to the same table set question_id
--    touches. Real FK where a backing row exists (chat_messages/voice_messages/
--    submission_transcripts/static_activity); no FK on audit-only tables
--    (ai_invocations/app_logs), same convention as every other audit-only
--    column in this plan.
-- ---------------------------------------------------------------------------
alter table public.chat_messages          add column if not exists session_id uuid references public.attempt_sessions(id) on delete set null;
alter table public.voice_messages         add column if not exists session_id uuid references public.attempt_sessions(id) on delete set null;
alter table public.submission_transcripts add column if not exists session_id uuid references public.attempt_sessions(id) on delete set null;
alter table public.static_activity        add column if not exists session_id uuid references public.attempt_sessions(id) on delete set null;
alter table public.ai_invocations         add column if not exists session_id uuid;
alter table public.app_logs               add column if not exists session_id uuid;
