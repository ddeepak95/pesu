-- AI usage metering — Phase 2 Step 2 (dev-docs/ai-usage-metering-phase2-plan.md §2)
-- Nightly pg_cron reconcile: rebuilds the ai_usage_counters cache over a small
-- rolling window, flags drift/anomalies to app_logs, and auto-closes
-- ai_invocations rows stuck in 'pending' past 24 hours (a killed-mid-request
-- process is the only way a row can get stuck there — every gateway call site
-- already resolves to completed/failed on any thrown error).

create extension if not exists pg_cron with schema extensions;

create or replace function public.reconcile_ai_usage_counters(p_since date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff date;
  v_sentinel uuid := '00000000-0000-0000-0000-000000000000';
  v_drift_row record;
  v_null_cost_count bigint;
  v_unattributed_count bigint;
  v_unmapped_count bigint;
  v_stuck_alert_count bigint;
  v_stuck_closed_count bigint;
  v_stuck_closed_ids uuid[];
begin
  -- A closed month's rows never change again once that month ends, so the
  -- default window only needs to cover the current period plus a 1-day
  -- buffer into the previous one (calls landing right at a month boundary).
  -- p_since is a manual escape hatch for a real backfill; the nightly
  -- schedule always calls with the default.
  v_cutoff := coalesce(
    p_since,
    (date_trunc('month', now() at time zone 'UTC') - interval '1 day')::date
  );

  -- 1. Snapshot pre-rebuild sentinel totals for the window, to diff against
  -- after rebuilding (drift check, step 4). Explicit drop first in case this
  -- function is invoked twice within the same transaction (ON COMMIT DROP
  -- only clears it at transaction end).
  drop table if exists _counter_snapshot;
  create temporary table _counter_snapshot on commit drop as
  select institution_id, key_owner, period_start, credits
  from public.ai_usage_counters
  where class_id = v_sentinel and usage_type = 'all' and period_start >= v_cutoff;

  -- 2. Windowed rebuild: delete + re-aggregate from source, bounded to the
  -- one or two periods that can plausibly still be in flux. Still a
  -- from-scratch recompute (not incremental diffing) — keeps the "eliminates
  -- a class of diff bugs" property, just windowed so cost stays roughly
  -- constant as ai_invocations grows into years of history.
  delete from public.ai_usage_counters where period_start >= v_cutoff;

  insert into public.ai_usage_counters
    (institution_id, class_id, key_owner, period_start, usage_type, credits, events)
  select institution_id, class_id, key_owner, period_start, usage_type,
         sum(credits) as credits, sum(events) as events
  from (
    -- class-level rows (only for invocations with a real, non-null class_id —
    -- otherwise this would double-count against the sentinel branches below).
    select institution_id, class_id, public.key_owner_from_source(ai_key_source) as key_owner,
           date_trunc('month', started_at at time zone 'UTC')::date as period_start,
           usage_type, credits, 1 as events
    from public.ai_invocations
    where started_at >= v_cutoff and status = 'completed' and credits is not null
      and institution_id is not null and class_id is not null

    union all

    select institution_id, class_id, public.key_owner_from_source(ai_key_source),
           date_trunc('month', started_at at time zone 'UTC')::date, 'all', credits, 1
    from public.ai_invocations
    where started_at >= v_cutoff and status = 'completed' and credits is not null
      and institution_id is not null and class_id is not null

    union all

    -- institution-wide sentinel rows, always (regardless of class_id).
    select institution_id, v_sentinel, public.key_owner_from_source(ai_key_source),
           date_trunc('month', started_at at time zone 'UTC')::date, usage_type, credits, 1
    from public.ai_invocations
    where started_at >= v_cutoff and status = 'completed' and credits is not null
      and institution_id is not null

    union all

    select institution_id, v_sentinel, public.key_owner_from_source(ai_key_source),
           date_trunc('month', started_at at time zone 'UTC')::date, 'all', credits, 1
    from public.ai_invocations
    where started_at >= v_cutoff and status = 'completed' and credits is not null
      and institution_id is not null
  ) fanned
  group by institution_id, class_id, key_owner, period_start, usage_type;

  -- 3. Both rebuild steps ran inside this one function invocation, so no
  -- reader ever observes a gap between the delete and the re-insert.

  -- 4. Drift check: an institution/key_owner pair that moved by more than
  -- $0.01 worth of credits is the signal that the per-invocation upsert
  -- (record_usage_counter, called from completeAiInvocation) exhausted its
  -- after() retries and silently failed at least once since the last run.
  for v_drift_row in
    select
      coalesce(s.institution_id, n.institution_id) as institution_id,
      coalesce(s.key_owner, n.key_owner) as key_owner,
      coalesce(s.period_start, n.period_start) as period_start,
      coalesce(s.credits, 0) as before_credits,
      coalesce(n.credits, 0) as after_credits
    from _counter_snapshot s
    full outer join (
      select institution_id, key_owner, period_start, credits
      from public.ai_usage_counters
      where class_id = v_sentinel and usage_type = 'all' and period_start >= v_cutoff
    ) n
      on s.institution_id = n.institution_id
     and s.key_owner = n.key_owner
     and s.period_start = n.period_start
    where abs(coalesce(s.credits, 0) - coalesce(n.credits, 0)) > 0.01
  loop
    insert into public.app_logs (level, source, event, institution_id, message, metadata)
    values (
      'warn', 'usage_metering', 'counter_drift', v_drift_row.institution_id,
      format(
        'ai_usage_counters drift for institution %s / key_owner %s / period %s: %s -> %s credits',
        v_drift_row.institution_id, v_drift_row.key_owner, v_drift_row.period_start,
        v_drift_row.before_credits, v_drift_row.after_credits
      ),
      jsonb_build_object(
        'key_owner', v_drift_row.key_owner,
        'period_start', v_drift_row.period_start,
        'before_credits', v_drift_row.before_credits,
        'after_credits', v_drift_row.after_credits
      )
    );
  end loop;

  -- 5. Anomaly flags — each an app_logs insert only when count > 0.
  select count(*) into v_null_cost_count
  from public.ai_invocations
  where status = 'completed' and cost_usd is null and started_at >= now() - interval '2 days';

  if v_null_cost_count > 0 then
    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'null_cost_rows',
      format('%s completed ai_invocations rows with null cost_usd in the last 2 days', v_null_cost_count),
      jsonb_build_object('count', v_null_cost_count)
    );
  end if;

  select count(*) into v_unattributed_count
  from public.ai_invocations
  where app_function_key = 'unattributed' and started_at >= now() - interval '2 days';

  if v_unattributed_count > 0 then
    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'unattributed_rows',
      format('%s ai_invocations rows started with no attribution context in the last 2 days', v_unattributed_count),
      jsonb_build_object('count', v_unattributed_count)
    );
  end if;

  -- Fires when key_owner_from_source's fail-safe ELSE branch fired (an
  -- ai_key_source outside the known platform/env/institution/class values —
  -- including the legitimate-but-rare 'unconfigured', or anything unmapped).
  select count(*) into v_unmapped_count
  from public.ai_invocations
  where (ai_key_source is null or ai_key_source not in ('platform', 'env', 'institution', 'class'))
    and started_at >= now() - interval '2 days';

  if v_unmapped_count > 0 then
    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'unmapped_key_source',
      format('%s ai_invocations rows had an ai_key_source outside the known values in the last 2 days', v_unmapped_count),
      jsonb_build_object('count', v_unmapped_count)
    );
  end if;

  -- 6. Stuck pending — close first (24h), so the 60-minute alert stops
  -- re-firing forever on rows that will never resolve on their own (the
  -- whole process was killed mid-request: function timeout, OOM, deploy
  -- restart — every gateway call site already resolves to completed/failed
  -- on any thrown error, so nothing else will ever close a row this old).
  with closed as (
    update public.ai_invocations
    set status = 'failed',
        error_message = coalesce(
          error_message,
          'Auto-closed by nightly reconcile: stuck in pending status past 24 hours.'
        ),
        completed_at = now()
    where status = 'pending' and started_at < now() - interval '24 hours'
    returning id
  )
  select count(*), coalesce(array_agg(id), '{}') into v_stuck_closed_count, v_stuck_closed_ids from closed;

  if v_stuck_closed_count > 0 then
    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'reconcile_closed_stuck_pending',
      format('%s ai_invocations rows auto-closed after being stuck in pending status past 24 hours', v_stuck_closed_count),
      jsonb_build_object('count', v_stuck_closed_count, 'ids', to_jsonb(v_stuck_closed_ids))
    );
  end if;

  select count(*) into v_stuck_alert_count
  from public.ai_invocations
  where status = 'pending' and started_at < now() - interval '60 minutes';

  if v_stuck_alert_count > 0 then
    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'stuck_pending_rows',
      format('%s ai_invocations rows stuck in pending status past 60 minutes', v_stuck_alert_count),
      jsonb_build_object('count', v_stuck_alert_count)
    );
  end if;
end;
$$;

revoke execute on function public.reconcile_ai_usage_counters(date) from anon, authenticated;

-- Daily 08:00 UTC (low-traffic window for a US-institution-heavy base) —
-- revisit once real traffic is observed.
select cron.schedule(
  'ai-usage-counters-nightly-reconcile',
  '0 8 * * *',
  $$ select public.reconcile_ai_usage_counters(); $$
);
