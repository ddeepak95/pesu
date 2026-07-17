-- AI usage metering — auto-provision default wallets on institution/class
-- creation, per product decisions 2026-07-15/16 (post-Phase-3, follow-up to
-- dev-docs/ai-usage-metering-phase3-plan.md). Applies going forward only
-- (AFTER INSERT triggers) — existing institutions/classes are not backfilled.

-- Institution admins already have INSERT/UPDATE access to their own
-- ai_institution_settings row (20260708000000_ai_institution_settings_admin_write_policy.sql),
-- and this new column isn't locked by the existing super-admin-lock trigger
-- (which only guards allow_admin_edit/allow_use_platform_defaults), so no new
-- RLS/trigger work is needed to let admins configure it.
alter table public.ai_institution_settings
  add column if not exists default_class_wallet_credits numeric(14,4);
  -- Default spending cap seeded onto every newly created class's wallet.
  -- null = uncapped: the new class gets no wallet row at all and simply draws
  -- from the institution pool (which is always debited and gated regardless
  -- under the dual-debit model).

create or replace function public.seed_institution_ai_credit_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_wallet_id uuid;
  -- Platform-level default, no config surface yet — change this constant
  -- when the real default is decided (see dev-docs plan, product decision
  -- 2026-07-15: "10,000, we will change it later").
  v_default_credits constant numeric(14,4) := 10000;
begin
  insert into public.ai_credit_wallets (institution_id, class_id, enforcement)
  values (NEW.id, null, 'block')
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

-- A new class gets a cap wallet only when the institution has configured a
-- default cap. The 'allocation' transaction sets the class's allowance — it is
-- NOT money moving out of the institution pool (dual-debit model: usage debits
-- the class cap and the institution pool in lockstep). An uncapped class gets
-- no wallet row: it draws from the institution pool, which gates and meters it
-- on its own.
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
    insert into public.ai_credit_wallets (institution_id, class_id, enforcement)
    values (NEW.institution_id, NEW.id, 'block')
    returning id into v_wallet_id;

    insert into public.ai_credit_transactions (wallet_id, type, credits, note)
    values (v_wallet_id, 'allocation', v_default_credits, 'Default class spending cap on class creation');

    insert into public.ai_credit_balances (wallet_id, balance)
    values (v_wallet_id, v_default_credits);
  end if;

  return NEW;
end;
$$;

alter function public.seed_class_ai_credit_wallet() owner to postgres;

create trigger classes_seed_ai_credit_wallet_trg
  after insert on public.classes
  for each row execute function public.seed_class_ai_credit_wallet();
