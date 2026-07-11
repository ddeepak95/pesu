-- app_logs: a largely-agnostic, human-scannable admin event/error feed.
--
-- Complements ai_invocations (deep AI audit, service-role only, GCS payloads).
-- app_logs is lightweight, RLS-readable by the platform super admin (all rows)
-- and institution admins (their institution's rows). It is NOT AI-specific —
-- source/event are free-text conventions so future non-AI producers need no
-- migration. The AI retry/failure-recovery work is simply its first producer.
--
-- See dev-docs/ai-retry-and-failure-recovery-plan.md §8.

create table if not exists public.app_logs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  level            text not null check (level in ('info', 'warn', 'error')),
  source           text not null,   -- e.g. 'multimodal_turn' | 'multimodal_action' | 'action_retry' | 'evaluate'
  event            text not null,   -- e.g. 'ai_failure' | 'silent_retry' | 'manual_retry'
  error_code       text,            -- AiErrorCode when applicable
  message          text,
  -- scoping chain (all nullable — the table stays agnostic):
  -- institution_id is denormalized at write time (derived from the class) so
  -- RLS never needs a join; classes don't move between institutions.
  institution_id   uuid references public.institutions(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete set null,
  activity_type    text,            -- 'assignment' | 'quiz' | 'survey' | 'learning_content'
  activity_id      text,            -- matches ai_invocations.assignment_id (text ids)
  submission_id    text,
  question_order   integer,
  user_id          uuid,            -- affected user (student/teacher), when known
  ai_invocation_id uuid references public.ai_invocations(id) on delete set null,
  metadata         jsonb not null default '{}'::jsonb
);

alter table public.app_logs owner to postgres;

create index if not exists app_logs_institution_created_idx
  on public.app_logs (institution_id, created_at desc);
create index if not exists app_logs_class_created_idx
  on public.app_logs (class_id, created_at desc) where class_id is not null;
create index if not exists app_logs_level_created_idx
  on public.app_logs (level, created_at desc);

alter table public.app_logs enable row level security;

-- SELECT: super admin sees everything; institution admin sees their institution
-- (rows with institution_id is null are super-admin-only).
drop policy if exists "Admins read app logs" on public.app_logs;
create policy "Admins read app logs" on public.app_logs
  for select
  using (
    public.is_platform_super_admin()
    or (institution_id is not null and public.is_institution_admin(institution_id))
  );

-- INSERT/UPDATE/DELETE: no policies for authenticated — all writes go through
-- the service-role client from server code only, mirroring ai_invocations.

grant all on table public.app_logs to anon;
grant all on table public.app_logs to authenticated;
grant all on table public.app_logs to service_role;
