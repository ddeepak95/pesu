-- AI usage metering — optional BYOK counting against class cap wallets
-- (product decision 2026-07-17). A class cap wallet may opt in to counting
-- BYOK usage (institution- or class-owned keys, independently toggled)
-- toward the class's spending limit, with full gating. The institution pool
-- is NEVER debited or gated for BYOK — the key owner pays the provider
-- directly; the cap merely limits volume in rate-card credit terms.

-- ─── Per-wallet flags — runtime source of truth. Only meaningful on class
-- cap wallets (class_id is not null); inert on the pool wallet. Covered by
-- the existing UPDATE RLS policy (institution/super admins) and the to_jsonb
-- audit trigger with no further work. Institution-BYOK counting defaults ON
-- (a class cap limits volume regardless of which institution-level key
-- serves it); class-BYOK counting defaults OFF (the class owns that key and
-- its cost).
alter table public.ai_credit_wallets
  add column count_institution_byok boolean not null default true,
  add column count_class_byok boolean not null default false;

-- ─── Institution-level defaults, seeded onto auto-provisioned class wallets
-- alongside default_class_wallet_credits. Not locked by the super-admin-lock
-- trigger (which only guards allow_admin_edit/allow_use_platform_defaults),
-- so institution admins can configure them — intended.
alter table public.ai_institution_settings
  add column if not exists default_class_count_institution_byok boolean not null default true,
  add column if not exists default_class_count_class_byok boolean not null default false;

-- ─── Seed trigger: carry the two defaults onto new class cap wallets.
-- Otherwise unchanged from 20260717000000_ai_credit_wallets_auto_provision.sql.
create or replace function public.seed_class_ai_credit_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_wallet_id uuid;
  v_default_credits numeric(14,4);
  v_count_inst boolean;
  v_count_class boolean;
begin
  if NEW.institution_id is null then
    return NEW;
  end if;

  select default_class_wallet_credits,
         coalesce(default_class_count_institution_byok, true),
         coalesce(default_class_count_class_byok, false)
    into v_default_credits, v_count_inst, v_count_class
  from public.ai_institution_settings
  where institution_id = NEW.institution_id;

  if v_default_credits is not null then
    insert into public.ai_credit_wallets
      (institution_id, class_id, enforcement, count_institution_byok, count_class_byok)
    values (NEW.institution_id, NEW.id, 'block',
            coalesce(v_count_inst, true), coalesce(v_count_class, false))
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

-- ─── debit_usage_wallets — new p_include_pool mode. Platform-key usage keeps
-- the dual debit (class cap when present + institution pool in lockstep).
-- BYOK-counted usage passes p_include_pool = false: the class cap alone is
-- debited, the pool block is skipped entirely. Signature changes, so the old
-- 3-arg function must be dropped (create or replace cannot change a
-- signature, and keeping both overloads would make 3-arg calls ambiguous
-- against the new default parameter).
drop function if exists public.debit_usage_wallets(uuid, uuid, numeric);

create function public.debit_usage_wallets(
  p_institution_id uuid, p_class_wallet_id uuid, p_credits numeric,
  p_include_pool boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool_wallet_id uuid;
begin
  if p_class_wallet_id is not null then
    insert into public.ai_credit_balances (wallet_id, balance)
    values (p_class_wallet_id, -p_credits)
    on conflict (wallet_id) do update
      set balance = ai_credit_balances.balance - p_credits, updated_at = now();
  end if;

  if p_include_pool then
    select id into v_pool_wallet_id
    from public.ai_credit_wallets
    where institution_id = p_institution_id and class_id is null;

    if v_pool_wallet_id is not null then
      insert into public.ai_credit_balances (wallet_id, balance)
      values (v_pool_wallet_id, -p_credits)
      on conflict (wallet_id) do update
        set balance = ai_credit_balances.balance - p_credits, updated_at = now();
    end if;
  end if;
end;
$$;

alter function public.debit_usage_wallets(uuid, uuid, numeric, boolean) owner to postgres;

-- Revoke from PUBLIC, not just anon/authenticated — Postgres grants EXECUTE
-- on new functions to PUBLIC by default, so revoking only the named roles
-- would leave them access through the PUBLIC grant.
revoke all on function public.debit_usage_wallets(uuid, uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function public.debit_usage_wallets(uuid, uuid, numeric, boolean) to service_role;

-- Note: reconcile_ai_credit_balances (20260716010000) needs no functional
-- change — class caps are summed from ai_invocations by wallet_id (which
-- BYOK-counted invocations now carry), and the pool sum already excludes
-- BYOK rows via normalize_key_source(ai_key_source) = 'platform'.
