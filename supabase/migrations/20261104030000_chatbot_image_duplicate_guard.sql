-- Reject disabled destinations instead of silently dropping uploaded images during duplication.
create or replace function public.save_chatbot(p_class_id uuid, p_group_id uuid, p_config jsonb, p_id uuid default null, p_placement jsonb default '{}'::jsonb)
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
    if not public.chatbot_images_allowed(p_class_id) and exists(
      select 1 from public.chatbot_images where chatbot_id = source_id and status = 'ready'
    ) then
      raise exception 'Enable uploaded chatbot images in the destination class before duplicating this library' using errcode = '42501';
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
