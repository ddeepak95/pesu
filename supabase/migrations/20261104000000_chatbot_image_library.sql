-- Private, version-preserving teacher image libraries. Applied migrations stay intact.
alter table public.chatbots add column image_mode text not null default 'off'
  check (image_mode in ('off','append','replace'));
alter table public.chatbot_messages add column image_mappings jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_mappings) = 'array');
alter table public.chatbot_messages add column image_matching_invocation_id uuid references public.ai_invocations(id) on delete set null;

create table public.chatbot_images (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 2000),
  filename text not null check (length(filename) between 1 and 255),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  file_size integer not null check (file_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending','ready','removed')),
  created_at timestamptz not null default now()
);
create index chatbot_images_library on public.chatbot_images(chatbot_id, status);
alter table public.chatbot_images enable row level security;
revoke all on public.chatbot_images from anon, authenticated;
grant all on public.chatbot_images to service_role;

create function public.chatbot_images_allowed(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.setting_values where scope = 'class' and scope_id = p_class_id
    and key = 'allow_chatbot_images' and value = 'true'::jsonb);
$$;
revoke all on function public.chatbot_images_allowed(uuid) from public, anon, authenticated;
grant execute on function public.chatbot_images_allowed(uuid) to service_role;

-- The generic settings RLS allows class owners to configure other settings.
-- This permission must remain admin-only even through direct Supabase writes.
create function public.guard_chatbot_image_setting() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_value public.setting_values;
begin
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
create trigger guard_chatbot_image_setting before insert or update or delete on public.setting_values
  for each row execute function public.guard_chatbot_image_setting();

-- Preserve the existing save implementation and its permission checks.
alter function public.save_chatbot(uuid, uuid, jsonb, uuid, jsonb) rename to save_chatbot_before_images;
revoke all on function public.save_chatbot_before_images(uuid, uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
create function public.save_chatbot(p_class_id uuid, p_group_id uuid, p_config jsonb, p_id uuid default null, p_placement jsonb default '{}'::jsonb)
returns public.chatbots language plpgsql security definer set search_path = public as $$
declare b public.chatbots; old_mode text; mode text; source_id uuid;
begin
  if not public.chatbot_teacher(p_class_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select image_mode into old_mode from public.chatbots where id = p_id for update;
  mode := coalesce(p_config->>'image_mode', old_mode, 'off');
  if mode not in ('off','append','replace') then raise exception 'Invalid image mode'; end if;
  if mode <> coalesce(old_mode, 'off') and not public.chatbot_images_allowed(p_class_id) then
    raise exception 'Uploaded chatbot images are disabled for this class' using errcode = '42501';
  end if;
  b := public.save_chatbot_before_images(p_class_id, p_group_id, p_config, p_id, p_placement);
  update public.chatbots set image_mode = mode where id = b.id returning * into b;
  source_id := (p_placement->>'image_source_id')::uuid;
  if p_id is null and source_id is not null then
    if not exists(select 1 from public.chatbots s where s.id = source_id and public.chatbot_teacher(s.class_id)) then
      raise exception 'Source chatbot unavailable' using errcode = '42501';
    end if;
    if public.chatbot_images_allowed(p_class_id) then
      -- Independent entries share immutable files; removing an entry never deletes a referenced file.
      insert into public.chatbot_images(chatbot_id, description, filename, storage_path, mime_type, file_size, status)
        select b.id, description, filename, storage_path, mime_type, file_size, 'ready'
        from public.chatbot_images where chatbot_id = source_id and status = 'ready';
    end if;
  end if;
  return b;
end;
$$;
revoke all on function public.save_chatbot(uuid, uuid, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.save_chatbot(uuid, uuid, jsonb, uuid, jsonb) to authenticated;

-- Serializes concurrent uploads, confirms, removals and description changes against the bot.
create function public.manage_chatbot_image(p_bot_id uuid, p_actor_id uuid, p_action text, p_data jsonb)
returns public.chatbot_images language plpgsql security definer set search_path = public as $$
declare b public.chatbots; img public.chatbot_images;
begin
  select * into b from public.chatbots where id = p_bot_id and status in ('draft','active') for update;
  if not found or not public.chatbot_teacher_for_user(b.class_id, p_actor_id) or not public.chatbot_images_allowed(b.class_id) then
    raise exception 'Image library unavailable' using errcode = '42501';
  end if;
  if p_action = 'request' then
    if (select count(*) from public.chatbot_images where chatbot_id = b.id and
      (status = 'ready' or (status = 'pending' and created_at > now() - interval '20 minutes'))) >= 20 then
      raise exception 'Maximum 20 images per chatbot';
    end if;
    insert into public.chatbot_images(id, chatbot_id, description, filename, storage_path, mime_type, file_size)
      values((p_data->>'id')::uuid, b.id, btrim(p_data->>'description'), p_data->>'filename', p_data->>'storage_path',
        p_data->>'mime_type', (p_data->>'file_size')::integer) returning * into img;
  else
    select * into img from public.chatbot_images where id = (p_data->>'id')::uuid and chatbot_id = b.id for update;
    if not found then raise exception 'Image not found'; end if;
    if p_action = 'confirm' and img.status = 'pending' and img.created_at > now() - interval '20 minutes' then
      update public.chatbot_images set status = 'ready', storage_path = p_data->>'storage_path',
        file_size = (p_data->>'file_size')::integer where id = img.id returning * into img;
    elsif p_action = 'edit' and img.status = 'ready' then
      update public.chatbot_images set description = btrim(p_data->>'description') where id = img.id returning * into img;
    elsif p_action = 'remove' then
      update public.chatbot_images set status = 'removed' where id = img.id returning * into img;
    else raise exception 'Image operation unavailable'; end if;
  end if;
  return img;
end;
$$;
revoke all on function public.manage_chatbot_image(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_chatbot_image(uuid,uuid,text,jsonb) to service_role;

create function public.finish_chatbot_turn_images(p_conversation_id uuid, p_message_id uuid, p_reply text,
  p_sources jsonb, p_search_entry_point text, p_invocation_id uuid,
  p_image_mappings jsonb, p_matching_invocation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.chatbot_conversations; m_id uuid; opening boolean;
begin
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if jsonb_typeof(p_image_mappings) <> 'array' then raise exception 'Invalid image mappings'; end if;
  if exists(select 1 from jsonb_array_elements(p_image_mappings) x where
    x->>'action' not in ('append','replace') or not exists(select 1 from public.chatbot_images i
      where i.id = (x->>'image_id')::uuid and i.chatbot_id = c.chatbot_id and i.status in ('ready','removed'))) then
    raise exception 'Invalid image mapping';
  end if;
  select role = 'assistant' into opening from public.chatbot_messages where id = p_message_id;
  perform public.finish_chatbot_turn(p_conversation_id, p_message_id, p_reply, p_sources, p_search_entry_point, p_invocation_id);
  if opening then m_id := p_message_id;
  else select id into m_id from public.chatbot_messages where conversation_id = c.id and role = 'assistant'
    order by created_at desc, id desc limit 1; end if;
  update public.chatbot_messages set image_mappings = p_image_mappings,
    image_matching_invocation_id = p_matching_invocation_id where id = m_id;
end;
$$;
revoke all on function public.finish_chatbot_turn_images(uuid,uuid,text,jsonb,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.finish_chatbot_turn_images(uuid,uuid,text,jsonb,text,uuid,jsonb,uuid) to service_role;
