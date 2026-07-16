-- AI usage metering — Phase 3 Step 1-2 (dev-docs/ai-usage-metering-phase3-plan.md
-- §Implementation 1-2). Wallets + ledger + derived balance + policy audit, plus
-- allocate_wallet_credits (the only funding/policy write path this phase — D9).

create table public.ai_credit_wallets (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete cascade,  -- null = institution-level
  key_owner      text not null default 'platform',                      -- 'platform' | 'byok'
  monthly_grant  numeric(14,4),      -- reserved for future cron (D-revision #1); inert this phase
  max_balance    numeric(14,4),      -- this wallet's own rollover cap; null = unbounded
  class_allocation_capacity numeric(14,4),  -- institution-only; null = unbounded (D8)
  soft_warn_threshold numeric(14,4),
  enforcement    text not null default 'off',       -- 'off' | 'warn' | 'block'
  self_manage_enabled boolean not null default false, -- institution-BYOK-only; locked, D10
  updated_at     timestamptz not null default now(),
  unique (institution_id, class_id, key_owner)
);

alter table public.ai_credit_wallets owner to postgres;

create table public.ai_credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.ai_credit_wallets(id) on delete cascade,
  type         text not null,             -- 'monthly_grant' | 'topup' | 'allocation' | 'adjustment'
  credits      numeric(14,8) not null,
  period_start date,                      -- reserved for the future monthly grant job
  created_by   uuid references auth.users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index ai_credit_transactions_wallet_time_idx
  on public.ai_credit_transactions (wallet_id, created_at desc);

alter table public.ai_credit_transactions owner to postgres;

create table public.ai_credit_balances (
  wallet_id  uuid primary key references public.ai_credit_wallets(id) on delete cascade,
  balance    numeric(14,8) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ai_credit_balances owner to postgres;

create table public.ai_credit_wallet_policy_audit (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid not null references public.ai_credit_wallets(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  before     jsonb,        -- null on the wallet's first insert
  after      jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_credit_wallet_policy_audit_wallet_time_idx
  on public.ai_credit_wallet_policy_audit (wallet_id, created_at desc);

alter table public.ai_credit_wallet_policy_audit owner to postgres;

alter table public.ai_invocations
  add column wallet_id uuid references public.ai_credit_wallets(id) on delete set null;

-- Partial (only wallet-attributed rows matter) — backs both the debit
-- read path and the nightly balance-reconcile aggregate.
create index ai_invocations_wallet_id_idx
  on public.ai_invocations (wallet_id) where wallet_id is not null;

-- ─── RLS: reads (three-tier, mirrors ai_usage_counters/ai_invocations) ───────

alter table public.ai_credit_wallets enable row level security;

create policy "Wallets readable by admins and class teachers" on public.ai_credit_wallets
  for select using (
    public.is_platform_super_admin()
    or public.is_institution_admin(institution_id)
    or (class_id is not null and public.is_class_teacher_admin(class_id))
  );

alter table public.ai_credit_transactions enable row level security;

create policy "Wallet transactions readable by admins and class teachers" on public.ai_credit_transactions
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_transactions.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and public.is_class_teacher_admin(w.class_id))
        )
    )
  );

alter table public.ai_credit_balances enable row level security;

create policy "Wallet balances readable by admins and class teachers" on public.ai_credit_balances
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_balances.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and public.is_class_teacher_admin(w.class_id))
        )
    )
  );

alter table public.ai_credit_wallet_policy_audit enable row level security;

create policy "Wallet policy audit readable by admins and class teachers" on public.ai_credit_wallet_policy_audit
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_wallet_policy_audit.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and public.is_class_teacher_admin(w.class_id))
        )
    )
  );

grant all on table public.ai_credit_wallets to service_role;
grant all on table public.ai_credit_transactions to service_role;
grant all on table public.ai_credit_balances to service_role;
grant all on table public.ai_credit_wallet_policy_audit to service_role;

-- ─── RLS: writes on ai_credit_wallets (D9), split INSERT vs. UPDATE like
-- ai_institution_settings ───────────────────────────────────────────────────

create policy "Admins create wallets in their scope" on public.ai_credit_wallets
  for insert
  with check (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and public.is_institution_admin(institution_id))
  );

create policy "Admins update wallets in their scope" on public.ai_credit_wallets
  for update
  using (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and self_manage_enabled and public.is_institution_admin(institution_id))
  )
  with check (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and self_manage_enabled and public.is_institution_admin(institution_id))
  );

-- Note the asymmetry: an institution admin can CREATE their institution's BYOK
-- wallet row (it starts locked), but can only UPDATE it once self_manage_enabled
-- is already true — resolved by a super admin's prior write. A platform-key_owner
-- institution-level wallet is never writable by an institution admin at all
-- (only super admin), regardless of INSERT or UPDATE.

-- No write RLS policies on ai_credit_transactions/ai_credit_balances — those are
-- only ever written by allocate_wallet_credits (SECURITY DEFINER) and
-- debit_wallet_balance (service-role, gateway-only), never by a direct client
-- insert. No write RLS policies on ai_credit_wallet_policy_audit either — only
-- the lock-and-audit trigger below writes to it.

-- ─── Lock-and-audit triggers (D9, D10) ───────────────────────────────────────
-- Split BEFORE (lock enforcement) / AFTER (audit log): the audit row's
-- wallet_id FK references ai_credit_wallets(id), which doesn't exist yet on
-- INSERT until after the row is actually written — a single BEFORE trigger
-- that tried to audit-log an INSERT would always violate that FK.

create or replace function public.ai_credit_wallets_enforce_locks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_super_admin() then
    if TG_OP = 'INSERT' and NEW.self_manage_enabled then
      raise exception 'Only platform super admins may enable self_manage_enabled';
    end if;
    if TG_OP = 'UPDATE' and NEW.self_manage_enabled is distinct from OLD.self_manage_enabled then
      raise exception 'Only platform super admins may change self_manage_enabled';
    end if;
  end if;

  return NEW;
end;
$$;

alter function public.ai_credit_wallets_enforce_locks() owner to postgres;

create trigger ai_credit_wallets_enforce_locks_trg
  before insert or update on public.ai_credit_wallets
  for each row execute function public.ai_credit_wallets_enforce_locks();

create or replace function public.ai_credit_wallets_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_credit_wallet_policy_audit (wallet_id, changed_by, before, after)
  values (
    NEW.id, auth.uid(),
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end,
    to_jsonb(NEW)
  );

  return NEW;
end;
$$;

alter function public.ai_credit_wallets_audit() owner to postgres;

create trigger ai_credit_wallets_audit_trg
  after insert or update on public.ai_credit_wallets
  for each row execute function public.ai_credit_wallets_audit();

-- ─── allocate_wallet_credits — funding, with capacity + permission checks
-- (D8, D9) ─────────────────────────────────────────────────────────────────

create or replace function public.allocate_wallet_credits(
  p_wallet_id uuid, p_credits numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.ai_credit_wallets%rowtype;
  v_is_super boolean := public.is_platform_super_admin();
  v_capacity numeric(14,4);
  v_current_class_sum numeric(14,4);
  v_type text;
begin
  select * into v_wallet from public.ai_credit_wallets where id = p_wallet_id;
  if v_wallet.id is null then
    raise exception 'Wallet % not found', p_wallet_id;
  end if;

  if v_wallet.class_id is null then
    v_type := 'topup';
    if v_wallet.key_owner = 'platform' and not v_is_super then
      raise exception 'Only platform super admins may fund a platform institution wallet';
    end if;
    if v_wallet.key_owner = 'byok' and not v_is_super
       and not (v_wallet.self_manage_enabled and public.is_institution_admin(v_wallet.institution_id)) then
      raise exception 'Not permitted to fund this institution''s BYOK wallet';
    end if;
  else
    v_type := 'allocation';
    if not v_is_super and not public.is_institution_admin(v_wallet.institution_id) then
      raise exception 'Not permitted to fund this class wallet';
    end if;

    -- FOR UPDATE serializes concurrent class allocations under the same
    -- institution+key_owner on the single institution-wallet row, so the
    -- sum-then-insert capacity check below can't be raced past its ceiling
    -- (D8). No institution wallet row -> no capacity -> unbounded, and
    -- nothing to race. Concurrent debits only shrink the sum (free up room),
    -- a safe direction, so they need no lock.
    select w.class_allocation_capacity into v_capacity
    from public.ai_credit_wallets w
    where w.institution_id = v_wallet.institution_id
      and w.class_id is null and w.key_owner = v_wallet.key_owner
    for update;

    if v_capacity is not null then
      select coalesce(sum(b.balance), 0) into v_current_class_sum
      from public.ai_credit_balances b
      join public.ai_credit_wallets w on w.id = b.wallet_id
      where w.institution_id = v_wallet.institution_id
        and w.class_id is not null and w.key_owner = v_wallet.key_owner;

      if v_current_class_sum + p_credits > v_capacity then
        raise exception 'Allocating % would exceed institution capacity (currently % of % allocated)',
          p_credits, v_current_class_sum, v_capacity;
      end if;
    end if;
  end if;

  insert into public.ai_credit_transactions (wallet_id, type, credits, created_by, note)
  values (p_wallet_id, v_type, p_credits, auth.uid(), p_note);

  insert into public.ai_credit_balances (wallet_id, balance)
  values (p_wallet_id, p_credits)
  on conflict (wallet_id) do update
    set balance = ai_credit_balances.balance + excluded.balance, updated_at = now();
end;
$$;

alter function public.allocate_wallet_credits(uuid, numeric, text) owner to postgres;

revoke all on function public.allocate_wallet_credits(uuid, numeric, text) from public;
grant execute on function public.allocate_wallet_credits(uuid, numeric, text) to authenticated;
grant execute on function public.allocate_wallet_credits(uuid, numeric, text) to service_role;

-- ─── debit_wallet_balance — called from completeAiInvocation (D1), alongside
-- record_usage_counter. Service-role-only; no floor at zero (a wallet may
-- legitimately go negative mid-session, decision #7). Shape unchanged from
-- the original main-plan draft (dev-docs/ai-usage-metering-plan.md §4.6).
create or replace function public.debit_wallet_balance(
  p_wallet_id uuid, p_credits numeric
) returns void
language sql security definer set search_path = public as $$
  update public.ai_credit_balances
    set balance = balance - p_credits,
        updated_at = now()
    where wallet_id = p_wallet_id;
$$;

alter function public.debit_wallet_balance(uuid, numeric) owner to postgres;

revoke execute on function public.debit_wallet_balance(uuid, numeric) from anon, authenticated;
