-- Let the existing class-delete cleanup trigger remove settings after the class
-- row has been deleted. Direct setting edits on an existing class stay admin-only.
create or replace function public.guard_chatbot_image_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.scope = 'class' and not exists(select 1 from public.classes where id = old.scope_id) then return old; end if;
  if tg_op <> 'INSERT' and old.key = 'allow_chatbot_images' then
    if not (public.is_platform_super_admin() or public.is_class_institution_admin(old.scope_id)) then
      raise exception 'Administrator access required' using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'DELETE' and new.key = 'allow_chatbot_images' then
    if new.scope <> 'class' or jsonb_typeof(new.value) <> 'boolean' then raise exception 'Invalid chatbot image setting'; end if;
    if not (public.is_platform_super_admin() or public.is_class_institution_admin(new.scope_id)) then
      raise exception 'Administrator access required' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
