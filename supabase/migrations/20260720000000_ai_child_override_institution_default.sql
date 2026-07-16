-- Institution-wide default for the class layer's allow_child_override_*
-- flags, so an institution admin no longer has to visit every class
-- individually to grant edit rights. Per-class rows keep working as an
-- explicit exception on top of the default (null = inherit).
--
-- Bundled fix: six read-only RLS policies (AI credit wallets/transactions/
-- balances/policy-audit, ai_usage_counters, ai_invocations) check
-- is_class_teacher_admin(class_id) alone, unlike the canonical
-- can_configure_class() helper which also ORs in has_full_class_control()
-- (owner/co-owner). That gap silently hides a class's own wallet/usage
-- data from its owner and co-owner.

-- 1. Institution layer: new default columns for the class-override flags.
alter table public.ai_institution_settings
  add column if not exists default_allow_child_override_providers boolean not null default false,
  add column if not exists default_allow_child_override_functions boolean not null default false;

-- 2. Class layer: make the per-class override columns nullable. NULL now
--    means "inherit the institution default" rather than "denied" — this
--    also means any future upsert that creates a class row for an
--    unrelated reason (e.g. toggling ai_access_enabled) leaves these
--    columns NULL/inherited instead of silently locking them to false.
alter table public.ai_class_settings
  alter column allow_child_override_providers drop not null,
  alter column allow_child_override_providers drop default,
  alter column allow_child_override_functions drop not null,
  alter column allow_child_override_functions drop default;

-- 3. Provider-activations policy trigger: fall back to the institution
--    default instead of hardcoded false when the class has no explicit
--    override.
create or replace function public.ai_provider_activations_enforce_institution_policy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allow_platform_defaults boolean;
  v_allow_override          boolean;
  v_institution_default     boolean;
begin
  if public.is_platform_super_admin() then
    return new;
  end if;

  if new.scope = 'institution' and new.use_platform_default = true then
    select s.allow_use_platform_defaults into v_allow_platform_defaults
      from public.ai_institution_settings s
      where s.institution_id = new.scope_id;

    if v_allow_platform_defaults is not null and v_allow_platform_defaults = false then
      raise exception 'Institution may not use platform AI defaults for this institution';
    end if;
  end if;

  if new.scope = 'class' then
    if public.is_class_institution_admin(new.scope_id) then
      return new;
    end if;

    if new.use_platform_default = false and new.is_active = true then
      select cs.allow_child_override_providers into v_allow_override
        from public.ai_class_settings cs
        where cs.class_id = new.scope_id;

      select s.default_allow_child_override_providers into v_institution_default
        from public.classes c
        join public.ai_institution_settings s on s.institution_id = c.institution_id
        where c.id = new.scope_id;

      if coalesce(v_allow_override, v_institution_default, false) = false then
        raise exception 'Class AI provider override is disabled for this class';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 4. Function-bindings policy trigger: same fallback treatment.
create or replace function public.ai_function_bindings_enforce_institution_policy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allow_override      boolean;
  v_institution_default boolean;
begin
  if public.is_platform_super_admin() then
    return new;
  end if;

  if new.scope = 'class' then
    if public.is_class_institution_admin(new.scope_id) then
      return new;
    end if;

    select cs.allow_child_override_functions into v_allow_override
      from public.ai_class_settings cs
      where cs.class_id = new.scope_id;

    select s.default_allow_child_override_functions into v_institution_default
      from public.classes c
      join public.ai_institution_settings s on s.institution_id = c.institution_id
      where c.id = new.scope_id;

    if coalesce(v_allow_override, v_institution_default, false) = false then
      raise exception 'Class AI function override is disabled for this class';
    end if;
  end if;

  return new;
end;
$$;

-- 5. Bug fix: add the missing has_full_class_control() arm (owner/co-owner)
--    to the six RLS select policies that currently only check
--    is_class_teacher_admin() (role = 'admin'), matching can_configure_class().

drop policy if exists "Wallets readable by admins and class teachers" on public.ai_credit_wallets;
create policy "Wallets readable by admins and class teachers" on public.ai_credit_wallets
  for select using (
    public.is_platform_super_admin()
    or public.is_institution_admin(institution_id)
    or (class_id is not null and (
      public.has_full_class_control(class_id)
      or public.is_class_teacher_admin(class_id)
    ))
  );

drop policy if exists "Wallet transactions readable by admins and class teachers" on public.ai_credit_transactions;
create policy "Wallet transactions readable by admins and class teachers" on public.ai_credit_transactions
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_transactions.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and (
            public.has_full_class_control(w.class_id)
            or public.is_class_teacher_admin(w.class_id)
          ))
        )
    )
  );

drop policy if exists "Wallet balances readable by admins and class teachers" on public.ai_credit_balances;
create policy "Wallet balances readable by admins and class teachers" on public.ai_credit_balances
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_balances.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and (
            public.has_full_class_control(w.class_id)
            or public.is_class_teacher_admin(w.class_id)
          ))
        )
    )
  );

drop policy if exists "Wallet policy audit readable by admins and class teachers" on public.ai_credit_wallet_policy_audit;
create policy "Wallet policy audit readable by admins and class teachers" on public.ai_credit_wallet_policy_audit
  for select using (
    exists (
      select 1 from public.ai_credit_wallets w
      where w.id = ai_credit_wallet_policy_audit.wallet_id
        and (
          public.is_platform_super_admin()
          or public.is_institution_admin(w.institution_id)
          or (w.class_id is not null and (
            public.has_full_class_control(w.class_id)
            or public.is_class_teacher_admin(w.class_id)
          ))
        )
    )
  );

drop policy if exists "Usage counters readable by admins and class teachers" on public.ai_usage_counters;
create policy "Usage counters readable by admins and class teachers" on public.ai_usage_counters
  for select using (
    public.is_platform_super_admin()
    or public.is_institution_admin(institution_id)
    or (class_id <> '00000000-0000-0000-0000-000000000000' and (
      public.has_full_class_control(class_id)
      or public.is_class_teacher_admin(class_id)
    ))
  );

drop policy if exists "Usage readable by admins and class teachers" on public.ai_invocations;
create policy "Usage readable by admins and class teachers" on public.ai_invocations
  for select using (
    public.is_platform_super_admin()
    or (institution_id is not null and public.is_institution_admin(institution_id))
    or (class_id is not null and (
      public.has_full_class_control(class_id)
      or public.is_class_teacher_admin(class_id)
    ))
  );
