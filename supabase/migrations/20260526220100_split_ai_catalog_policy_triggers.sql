-- Split shared ai_catalog_enforce_institution_policy into per-table triggers.

create or replace function public.ai_provider_activations_enforce_institution_policy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_institution_id          uuid;
  v_allow_override          boolean;
  v_allow_platform_defaults boolean;
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
    select c.institution_id into v_institution_id
      from public.classes c
      where c.id = new.scope_id;

    if v_institution_id is not null
       and new.use_platform_default = false
       and new.is_active = true then
      select s.allow_child_override into v_allow_override
        from public.ai_institution_settings s
        where s.institution_id = v_institution_id;

      if v_allow_override is not null and v_allow_override = false then
        raise exception 'Class AI override is disabled by the institution';
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
  v_institution_id uuid;
  v_allow_override boolean;
begin
  if public.is_platform_super_admin() then
    return new;
  end if;

  if new.scope = 'class' then
    select c.institution_id into v_institution_id
      from public.classes c
      where c.id = new.scope_id;

    if v_institution_id is not null then
      select s.allow_child_override into v_allow_override
        from public.ai_institution_settings s
        where s.institution_id = v_institution_id;

      if v_allow_override is not null and v_allow_override = false then
        raise exception 'Class AI override is disabled by the institution';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ai_provider_activations_enforce_policy_trg on public.ai_provider_activations;
create trigger ai_provider_activations_enforce_policy_trg
  before insert or update on public.ai_provider_activations
  for each row
  execute function public.ai_provider_activations_enforce_institution_policy();

drop trigger if exists ai_function_bindings_enforce_policy_trg on public.ai_function_bindings;
create trigger ai_function_bindings_enforce_policy_trg
  before insert or update on public.ai_function_bindings
  for each row
  execute function public.ai_function_bindings_enforce_institution_policy();
