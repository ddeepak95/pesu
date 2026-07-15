-- AI usage metering — Phase 3 Step 10 (dev-docs/ai-usage-metering-phase3-plan.md
-- §Implementation 10, D13). Nightly wallet balance reconcile — pg_cron
-- extension already exists from Phase 2's 20260714010000_pg_cron_usage_reconcile.sql.

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
    debited as (
      select wallet_id, coalesce(sum(credits), 0) as total_debited
      from public.ai_invocations
      where status = 'completed' and credits is not null and wallet_id is not null
      group by wallet_id
    ),
    expected as (
      select w.id as wallet_id,
             coalesce(c.total_credited, 0) - coalesce(d.total_debited, 0) as expected_balance
      from public.ai_credit_wallets w
      left join credited c on c.wallet_id = w.id
      left join debited d on d.wallet_id = w.id
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

revoke execute on function public.reconcile_ai_credit_balances() from anon, authenticated;

select cron.schedule(
  'ai-credit-balances-nightly-reconcile',
  '10 8 * * *',  -- 10 min after the usage-counters reconcile (same 08:00 UTC window)
  $$ select public.reconcile_ai_credit_balances(); $$
);
