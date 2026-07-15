-- AI usage metering — Phase 2 Step 1 (dev-docs/ai-usage-metering-phase2-plan.md §1)
-- O(1) analytics rollup over ai_invocations, keyed by (institution, class, key_owner,
-- period, usage_type). A pure, rebuildable cache — never a second source of truth.

-- Sentinel class_id for institution-wide rows (no FK — matches plan §4.5's rationale
-- that this table is a rebuildable cache, not a row that needs referential integrity
-- to a real class).
create table if not exists public.ai_usage_counters (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid not null default '00000000-0000-0000-0000-000000000000',
  key_owner      text not null,
  period_start   date not null,
  usage_type     text not null,
  credits        numeric(20,8) not null default 0,
  events         bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (institution_id, class_id, key_owner, period_start, usage_type)
);

alter table public.ai_usage_counters owner to postgres;

alter table public.ai_usage_counters enable row level security;

-- SELECT: mirrors the ai_invocations policy (20260713000000_ai_invocations_metering.sql).
-- No write policies — service-role only, same convention as ai_invocations/app_logs.
create policy "Usage counters readable by admins and class teachers" on public.ai_usage_counters
  for select using (
    public.is_platform_super_admin()
    or public.is_institution_admin(institution_id)
    or (class_id <> '00000000-0000-0000-0000-000000000000' and public.is_class_teacher_admin(class_id))
  );

grant all on table public.ai_usage_counters to service_role;

-- D1: the single source of truth for ai_key_source -> key_owner. Called by both the
-- hot-path upsert and the nightly rebuild so the two can never drift from each other.
-- 'platform'/'env' -> 'platform'; 'institution'/'class' -> 'byok'; anything else ->
-- 'platform' fail-safe default (flagged separately by the reconcile job's
-- unmapped_key_source anomaly check).
create or replace function public.key_owner_from_source(p_ai_key_source text)
returns text
language sql
immutable
as $$
  select case p_ai_key_source
    when 'platform' then 'platform'
    when 'env' then 'platform'
    when 'institution' then 'byok'
    when 'class' then 'byok'
    else 'platform'
  end;
$$;

revoke execute on function public.key_owner_from_source(text) from anon, authenticated;

-- Upserts 4 fan-out rows per invocation: (class, usage_type), (class, 'all'),
-- (institution-wide sentinel, usage_type), (institution-wide sentinel, 'all').
-- No-ops on a null institution_id (e.g. a row whose class couldn't be resolved).
create or replace function public.record_usage_counter(
  p_institution_id uuid,
  p_class_id uuid,
  p_ai_key_source text,
  p_started_at timestamptz,
  p_usage_type text,
  p_credits numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_owner text;
  v_period_start date;
  v_credits numeric(20,8);
  v_sentinel uuid := '00000000-0000-0000-0000-000000000000';
  v_class_id uuid;
begin
  if p_institution_id is null then
    return;
  end if;

  v_key_owner := public.key_owner_from_source(p_ai_key_source);
  v_period_start := date_trunc('month', p_started_at at time zone 'UTC')::date;
  v_credits := coalesce(p_credits, 0);
  v_class_id := coalesce(p_class_id, v_sentinel);

  -- Institution-wide sentinel rows, always written.
  insert into public.ai_usage_counters (institution_id, class_id, key_owner, period_start, usage_type, credits, events)
  values
    (p_institution_id, v_sentinel, v_key_owner, v_period_start, p_usage_type, v_credits, 1),
    (p_institution_id, v_sentinel, v_key_owner, v_period_start, 'all', v_credits, 1)
  on conflict (institution_id, class_id, key_owner, period_start, usage_type)
  do update set
    credits = public.ai_usage_counters.credits + excluded.credits,
    events = public.ai_usage_counters.events + 1,
    updated_at = now();

  -- Class-level rows, only when a real (non-sentinel) class is known — otherwise
  -- this would collide with the sentinel rows above within the same statement
  -- (same conflict key hit twice), which Postgres rejects.
  if v_class_id <> v_sentinel then
    insert into public.ai_usage_counters (institution_id, class_id, key_owner, period_start, usage_type, credits, events)
    values
      (p_institution_id, v_class_id, v_key_owner, v_period_start, p_usage_type, v_credits, 1),
      (p_institution_id, v_class_id, v_key_owner, v_period_start, 'all', v_credits, 1)
    on conflict (institution_id, class_id, key_owner, period_start, usage_type)
    do update set
      credits = public.ai_usage_counters.credits + excluded.credits,
      events = public.ai_usage_counters.events + 1,
      updated_at = now();
  end if;
end;
$$;

revoke execute on function public.record_usage_counter(uuid, uuid, text, timestamptz, text, numeric) from anon, authenticated;
