-- Replace the institution-wide "Allow class teachers to edit" flag
-- (ai_institution_settings.allow_child_override) with a per-class toggle.
-- An institution admin can now grant/revoke class AI-override permission on
-- a class-by-class basis instead of uniformly for every class in the
-- institution.

-- 1. New per-class settings table (mirrors ai_institution_settings' shape).
create table if not exists public.ai_class_settings (
  class_id uuid primary key references public.classes(id) on delete cascade,
  allow_child_override boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.ai_class_settings enable row level security;

grant all on table public.ai_class_settings to anon;
grant all on table public.ai_class_settings to authenticated;
grant all on table public.ai_class_settings to service_role;

drop policy if exists "Institution admins manage ai class settings" on public.ai_class_settings;
create policy "Institution admins manage ai class settings" on public.ai_class_settings
  using (public.is_class_institution_admin(class_id))
  with check (public.is_class_institution_admin(class_id));

drop policy if exists "Class co-teachers read ai class settings" on public.ai_class_settings;
create policy "Class co-teachers read ai class settings" on public.ai_class_settings
  for select
  using (public.is_class_co_teacher(class_id));

drop policy if exists "Super admins manage all ai class settings" on public.ai_class_settings;
create policy "Super admins manage all ai class settings" on public.ai_class_settings
  using (public.is_platform_super_admin())
  with check (public.is_platform_super_admin());

-- 2. Continuity backfill: institutions that had explicitly turned on BOTH
--    allow_admin_edit and allow_child_override previously allowed every one
--    of their classes to be overridden by class teachers (subject to the
--    app-layer hierarchy check requiring both flags). Preserve that state
--    per-class at cutover so no currently-working class silently regresses.
--    Classes under institutions that never enabled this combination get no
--    row (fail closed, matching the new default).
insert into public.ai_class_settings (class_id, allow_child_override, updated_by, updated_at)
select c.id, true, s.updated_by, now()
from public.classes c
join public.ai_institution_settings s on s.institution_id = c.institution_id
where s.allow_admin_edit = true and s.allow_child_override = true
on conflict (class_id) do nothing;

-- 3. Rewrite the two enforcement triggers to check the new per-class table
--    instead of ai_institution_settings.allow_child_override. Fail closed:
--    no row for a class means override is NOT allowed (unlike the old
--    fail-open-when-no-row behavior). Institution admins (not just super
--    admins) are exempted from this check, consistent with the app-layer
--    capability matrix (aiConfigCapabilities grants institution_admin an
--    unconditional class-scope bypass).
create or replace function public.ai_provider_activations_enforce_institution_policy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allow_platform_defaults boolean;
  v_allow_override          boolean;
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
      select cs.allow_child_override into v_allow_override
        from public.ai_class_settings cs
        where cs.class_id = new.scope_id;

      if coalesce(v_allow_override, false) = false then
        raise exception 'Class AI override is disabled for this class';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.ai_function_bindings_enforce_institution_policy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allow_override boolean;
begin
  if public.is_platform_super_admin() then
    return new;
  end if;

  if new.scope = 'class' then
    if public.is_class_institution_admin(new.scope_id) then
      return new;
    end if;

    select cs.allow_child_override into v_allow_override
      from public.ai_class_settings cs
      where cs.class_id = new.scope_id;

    if coalesce(v_allow_override, false) = false then
      raise exception 'Class AI override is disabled for this class';
    end if;
  end if;

  return new;
end;
$$;

-- Existing triggers (ai_provider_activations_enforce_policy_trg,
-- ai_function_bindings_enforce_policy_trg) already point at these function
-- names, so `create or replace function` is sufficient — no need to
-- recreate the triggers themselves.

-- 4. Drop the now-unused institution-wide column. Confirmed
--    ai_institution_settings_enforce_super_admin_locks() never references
--    allow_child_override in its body, so it needs no changes.
alter table public.ai_institution_settings drop column if exists allow_child_override;
