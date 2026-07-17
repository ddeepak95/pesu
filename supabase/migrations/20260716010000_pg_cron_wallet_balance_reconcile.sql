-- AI usage metering — Phase 3 Step 10 (dev-docs/ai-usage-metering-phase3-plan.md
-- §Implementation 10, D13). Nightly wallet balance reconcile — pg_cron
-- extension already exists from Phase 2's 20260714010000_pg_cron_usage_reconcile.sql.

-- Dual-debit model: an institution pool wallet (class_id null) is debited by
-- EVERY completed platform-key invocation under its institution (matched on
-- institution_id + ai_key_source, since only class-cap wallets are recorded in
-- ai_invocations.wallet_id); a class cap wallet is debited only by invocations
-- attributed to it via wallet_id. BYOK invocations (ai_key_source
-- 'institution'/'class') never touch any wallet.
create or replace function public.reconcile_ai_credit_balances()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    with credited as (
      select wallet_id, coalesce(sum(credits), 0) as total_credited
      from public.ai_credit_transactions
      group by wallet_id
    ),
    cap_debited as (
      select wallet_id, coalesce(sum(credits), 0) as total_debited
      from public.ai_invocations
      where status = 'completed' and credits is not null and wallet_id is not null
      group by wallet_id
    ),
    pool_debited as (
      select institution_id, coalesce(sum(credits), 0) as total_debited
      from public.ai_invocations
      where status = 'completed' and credits is not null
        and institution_id is not null
        and public.normalize_key_source(ai_key_source) = 'platform'
      group by institution_id
    ),
    expected as (
      select w.id as wallet_id,
             coalesce(c.total_credited, 0)
               - case when w.class_id is null
                      then coalesce(p.total_debited, 0)
                      else coalesce(d.total_debited, 0)
                 end as expected_balance
      from public.ai_credit_wallets w
      left join credited c on c.wallet_id = w.id
      left join cap_debited d on d.wallet_id = w.id
      left join pool_debited p on w.class_id is null and p.institution_id = w.institution_id
    )
    select e.wallet_id, e.expected_balance, coalesce(b.balance, 0) as before_balance
    from expected e
    left join public.ai_credit_balances b on b.wallet_id = e.wallet_id
    where abs(coalesce(b.balance, 0) - e.expected_balance) > 0.00000001
  loop
    insert into public.ai_credit_balances (wallet_id, balance)
    values (v_row.wallet_id, v_row.expected_balance)
    on conflict (wallet_id) do update
      set balance = excluded.balance, updated_at = now();

    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'wallet_balance_drift',
      format('ai_credit_balances drift for wallet %s: %s -> %s credits',
        v_row.wallet_id, v_row.before_balance, v_row.expected_balance),
      jsonb_build_object(
        'wallet_id', v_row.wallet_id,
        'before_balance', v_row.before_balance,
        'after_balance', v_row.expected_balance
      )
    );
  end loop;
end;
$$;

alter function public.reconcile_ai_credit_balances() owner to postgres;

-- Revoke from PUBLIC too — Postgres grants EXECUTE on new functions to PUBLIC
-- by default, so named-role revokes alone don't actually restrict anything.
revoke all on function public.reconcile_ai_credit_balances() from public, anon, authenticated;
grant execute on function public.reconcile_ai_credit_balances() to service_role;

select cron.schedule(
  'ai-credit-balances-nightly-reconcile',
  '10 8 * * *',  -- 10 min after the usage-counters reconcile (same 08:00 UTC window)
  $$ select public.reconcile_ai_credit_balances(); $$
);
