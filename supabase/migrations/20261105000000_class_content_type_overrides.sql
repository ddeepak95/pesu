-- Class content-type overrides are administrator-managed complete lists.
create or replace function public.chatbot_creation_allowed(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(s.value, i.value, '["formative_assignment", "learning_content"]'::jsonb) ? 'chatbot'
    from public.classes c
    left join public.setting_values i on i.scope = 'institution' and i.scope_id = c.institution_id and i.key = 'allowed_content_types'
    left join public.setting_values s on s.scope = 'class' and s.scope_id = c.id and s.key = 'allowed_content_types'
    where c.id = p_class_id
  ), false);
$$;

-- Keep the existing lock rules, except for this admin-only class setting.
create or replace function public.setting_values_enforce_locks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_parent_allow_override boolean;
  v_class_institution uuid;
begin
  if public.is_platform_super_admin() then return new; end if;
  if tg_op = 'UPDATE' then
    if new.allow_admin_edit is distinct from old.allow_admin_edit then
      raise exception 'Only platform super admins may change allow_admin_edit on setting_values';
    end if;
    if new.scope = 'institution' and old.allow_admin_edit = false
       and new.value is distinct from old.value then
      raise exception 'Institution setting is locked by platform; value cannot be changed';
    end if;
  end if;
  if new.scope = 'class' then
    if new.key = 'allowed_content_types' and public.is_class_institution_admin(new.scope_id) then
      return new;
    end if;
    select c.institution_id into v_class_institution from public.classes c where c.id = new.scope_id;
    if v_class_institution is not null then
      select sv.allow_child_override into v_parent_allow_override from public.setting_values sv
      where sv.scope = 'institution' and sv.scope_id = v_class_institution and sv.key = new.key;
      if v_parent_allow_override is not null and v_parent_allow_override = false then
        raise exception 'Class override is disabled by the institution for key %', new.key;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create function public.guard_class_content_type_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Class deletion cleans up its settings after the parent row is gone.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
     and not exists (select 1 from public.classes where id = old.scope_id) then
    return old;
  end if;
  if tg_op <> 'INSERT' and old.scope = 'class' and old.key = 'allowed_content_types'
     and not (public.is_platform_super_admin() or public.is_class_institution_admin(old.scope_id)) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and new.scope = 'class' and new.key = 'allowed_content_types'
     and not (public.is_platform_super_admin() or public.is_class_institution_admin(new.scope_id)) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_class_content_type_setting before insert or update or delete on public.setting_values
for each row execute function public.guard_class_content_type_setting();
