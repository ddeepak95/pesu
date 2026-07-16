-- Split the combined "who may edit AI config" locks into independent
-- providers / app-functions grants, at both permission layers:
--   1. Institution layer: allow_admin_edit (super_admin -> institution_admin)
--   2. Class layer: allow_child_override (institution_admin -> class teachers)
-- Previously one boolean per layer gated editing of both provider
-- activations (API keys) and app-function model bindings together. This
-- lets a super_admin/institution_admin grant edit rights to only one of
-- the two sections.

-- 1. Institution layer: add the two new columns, backfill from the old
--    combined flag, then drop it.
alter table public.ai_institution_settings
  add column if not exists allow_admin_edit_providers boolean not null default false,
  add column if not exists allow_admin_edit_functions boolean not null default false;

update public.ai_institution_settings
  set allow_admin_edit_providers = allow_admin_edit,
      allow_admin_edit_functions = allow_admin_edit;

alter table public.ai_institution_settings
  drop column if exists allow_admin_edit;

-- 2. Class layer: same treatment for allow_child_override.
alter table public.ai_class_settings
  add column if not exists allow_child_override_providers boolean not null default false,
  add column if not exists allow_child_override_functions boolean not null default false;

update public.ai_class_settings
  set allow_child_override_providers = allow_child_override,
      allow_child_override_functions = allow_child_override;

alter table public.ai_class_settings
  drop column if exists allow_child_override;

-- 3. Institution-settings super-admin-lock trigger: guard the two new
--    columns instead of the dropped allow_admin_edit column. The
--    allow_use_platform_defaults guard is unchanged.
create or replace function public.ai_institution_settings_enforce_super_admin_locks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_platform_super_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.allow_admin_edit_providers is distinct from old.allow_admin_edit_providers then
      raise exception 'Only platform super admins may change allow_admin_edit_providers';
    end if;
    if new.allow_admin_edit_functions is distinct from old.allow_admin_edit_functions then
      raise exception 'Only platform super admins may change allow_admin_edit_functions';
    end if;
    if new.allow_use_platform_defaults is distinct from old.allow_use_platform_defaults then
      raise exception 'Only platform super admins may change allow_use_platform_defaults';
    end if;
  end if;

  return new;
end;
$$;

-- 4. Provider-activations policy trigger: check the providers-scoped
--    per-class override column instead of the dropped allow_child_override.
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
      select cs.allow_child_override_providers into v_allow_override
        from public.ai_class_settings cs
        where cs.class_id = new.scope_id;

      if coalesce(v_allow_override, false) = false then
        raise exception 'Class AI provider override is disabled for this class';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 5. Function-bindings policy trigger: check the functions-scoped
--    per-class override column instead of the dropped allow_child_override.
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

    select cs.allow_child_override_functions into v_allow_override
      from public.ai_class_settings cs
      where cs.class_id = new.scope_id;

    if coalesce(v_allow_override, false) = false then
      raise exception 'Class AI function override is disabled for this class';
    end if;
  end if;

  return new;
end;
$$;

-- Existing triggers already point at these function names, so
-- `create or replace function` is sufficient — no need to recreate them.
