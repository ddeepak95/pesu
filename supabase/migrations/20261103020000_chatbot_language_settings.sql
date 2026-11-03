-- One visible title; retain legacy topic data, but use title for all new saves.
alter table public.chatbots add column lock_language boolean not null default true;
alter table public.chatbot_conversations add column language text;
create or replace function public.save_chatbot(p_class_id uuid, p_group_id uuid, p_config jsonb, p_id uuid default null, p_placement jsonb default '{}'::jsonb)
returns public.chatbots language plpgsql security definer set search_path = public as $$
declare v_bot public.chatbots; v_position integer;
begin
  if auth.uid() is null or not public.chatbot_teacher(p_class_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_id is null then
    if not public.chatbot_creation_allowed(p_class_id) then raise exception 'Chatbots are not enabled for this class' using errcode = '42501'; end if;
    if not exists(select 1 from public.class_groups where id = p_group_id and class_id = p_class_id) then raise exception 'Choose a group in this class'; end if;
  end if;
  if p_config->>'status' not in ('active','draft') then raise exception 'Invalid status'; end if;
  if p_id is null then
    insert into public.chatbots(class_id, title, topic_title, language, system_prompt, turn_limit, max_conversations, web_search, image_search, lock_language, status, created_by)
      values(p_class_id, btrim(p_config->>'title'), btrim(p_config->>'title'), p_config->>'language', btrim(p_config->>'system_prompt'),
        (p_config->>'turn_limit')::integer, (p_config->>'max_conversations')::integer, (p_config->>'web_search')::boolean, (p_config->>'image_search')::boolean, coalesce((p_config->>'lock_language')::boolean, true), p_config->>'status', auth.uid()) returning * into v_bot;
    -- Serialize placement positions against other chatbot creates in this group.
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
    select coalesce(max(position), -1) + 1 into v_position from public.content_items where class_group_id = p_group_id and status in ('active','draft');
    insert into public.content_items(content_item_id, class_id, class_group_id, type, ref_id, position, created_by, status,
      due_at, lock_after_complete, require_teacher_unlock, unlock_days_after_previous)
      values(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), p_class_id, p_group_id, 'chatbot', v_bot.id, v_position, auth.uid(), v_bot.status,
        (p_placement->>'due_at')::timestamptz, coalesce((p_placement->>'lock_after_complete')::boolean, false),
        coalesce((p_placement->>'require_teacher_unlock')::boolean, false), (p_placement->>'unlock_days_after_previous')::integer);
  else
    update public.chatbots set title = btrim(p_config->>'title'), topic_title = btrim(p_config->>'title'), language = p_config->>'language',
      system_prompt = btrim(p_config->>'system_prompt'), turn_limit = (p_config->>'turn_limit')::integer, max_conversations = (p_config->>'max_conversations')::integer,
      web_search = (p_config->>'web_search')::boolean, image_search = (p_config->>'image_search')::boolean, lock_language = coalesce((p_config->>'lock_language')::boolean, true), status = p_config->>'status', updated_at = now()
      where id = p_id and class_id = p_class_id and status <> 'deleted' returning * into v_bot;
    if not found then raise exception 'Chatbot not found'; end if;
    update public.content_items set status = v_bot.status, updated_at = now() where ref_id = v_bot.id and type = 'chatbot' and status <> 'deleted';
  end if;
  return v_bot;
end;
$$;

create function public.set_chatbot_conversation_language(p_conversation_id uuid, p_actor_id uuid, p_language text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_bot_id uuid;
begin
  select chatbot_id into v_bot_id from public.chatbot_conversations where id = p_conversation_id and (student_id = p_actor_id or preview_owner_id = p_actor_id);
  select * into b from public.chatbots where id = v_bot_id for update;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if (c.is_preview and (b.status not in ('draft','active') or not public.chatbot_teacher_for_user(b.class_id, p_actor_id)))
    or (not c.is_preview and not public.chatbot_student(b.id, p_actor_id)) then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if b.lock_language then raise exception 'Conversation language is locked by your teacher' using errcode = '42501'; end if;
  if c.closed_at is not null then raise exception 'This conversation was restarted'; end if;
  if c.pending_until > now() then raise exception 'Wait for the current reply before changing language'; end if;
  if p_language is null or length(p_language) not between 2 and 35 then raise exception 'Invalid language'; end if;
  update public.chatbot_conversations set language = p_language where id = c.id;
end;
$$;
revoke all on function public.set_chatbot_conversation_language(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_chatbot_conversation_language(uuid, uuid, text) to service_role;
