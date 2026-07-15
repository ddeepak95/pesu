-- AI usage metering — auto-provision default wallets on institution/class
-- creation, per product decision 2026-07-15 (post-Phase-3, follow-up to
-- dev-docs/ai-usage-metering-phase3-plan.md). Applies going forward only
-- (AFTER INSERT triggers) — existing institutions/classes are not backfilled.

-- Institution admins already have INSERT/UPDATE access to their own
-- ai_institution_settings row (20260708000000_ai_institution_settings_admin_write_policy.sql),
-- and this new column isn't locked by the existing super-admin-lock trigger
-- (which only guards allow_admin_edit/allow_use_platform_defaults), so no new
-- RLS/trigger work is needed to let admins configure it.
alter table public.ai_institution_settings
  add column if not exists default_class_wallet_credits numeric(14,4);
  -- null = unbounded: a newly created class gets an explicit
  -- enforcement='off' wallet (unmetered) rather than falling through to the
  -- institution wallet's own balance (which would silently meter it after
  -- all, contradicting "unbounded").

create or replace function public.seed_institution_ai_credit_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_wallet_id uuid;
  -- Platform-level default, no config surface yet — change this constant
  -- when the real default is decided (see dev-docs plan, product decision
  -- 2026-07-15: "10,000, we will change it later").
  v_default_credits constant numeric(14,4) := 10000;
begin
  insert into public.ai_credit_wallets (institution_id, class_id, key_owner, enforcement)
  values (NEW.id, null, 'platform', 'block')
  returning id into v_wallet_id;

  insert into public.ai_credit_transactions (wallet_id, type, credits, note)
  values (v_wallet_id, 'topup', v_default_credits, 'Default platform allocation on institution creation');

  insert into public.ai_credit_balances (wallet_id, balance)
  values (v_wallet_id, v_default_credits);

  return NEW;
end;
$$;

alter function public.seed_institution_ai_credit_wallet() owner to postgres;

create trigger institutions_seed_ai_credit_wallet_trg
  after insert on public.institutions
  for each row execute function public.seed_institution_ai_credit_wallet();

-- Every new class gets an explicit platform-key_owner wallet — even when the
-- institution's default is "unbounded" (null), a real enforcement='off' row is
-- created rather than none at all, so the class stays genuinely unrestricted
-- (most-specific-first lookup, D5) instead of falling through to whatever the
-- institution's own wallet balance/enforcement happens to be.
create or replace function public.seed_class_ai_credit_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_wallet_id uuid;
  v_default_credits numeric(14,4);
begin
  if NEW.institution_id is null then
    return NEW;
  end if;

  select default_class_wallet_credits into v_default_credits
  from public.ai_institution_settings
  where institution_id = NEW.institution_id;

  if v_default_credits is not null then
    insert into public.ai_credit_wallets (institution_id, class_id, key_owner, enforcement)
    values (NEW.institution_id, NEW.id, 'platform', 'block')
    returning id into v_wallet_id;

    insert into public.ai_credit_transactions (wallet_id, type, credits, note)
    values (v_wallet_id, 'allocation', v_default_credits, 'Default class wallet grant on class creation');

    insert into public.ai_credit_balances (wallet_id, balance)
    values (v_wallet_id, v_default_credits);
  else
    insert into public.ai_credit_wallets (institution_id, class_id, key_owner, enforcement)
    values (NEW.institution_id, NEW.id, 'platform', 'off');
  end if;

  return NEW;
end;
$$;

alter function public.seed_class_ai_credit_wallet() owner to postgres;

create trigger classes_seed_ai_credit_wallet_trg
  after insert on public.classes
  for each row execute function public.seed_class_ai_credit_wallet();
