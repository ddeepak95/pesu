-- Existing conversations retain their context; new ones start with a metered greeting.
alter table public.chatbot_conversations add column opening_complete boolean not null default true;
alter table public.chatbot_conversations alter column opening_complete set default false;

create or replace function public.reserve_chatbot_turn(p_conversation_id uuid, p_student_id uuid, p_message_id uuid, p_content text)
returns public.chatbot_conversations language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_bot_id uuid;
begin
  select chatbot_id into v_bot_id from public.chatbot_conversations where id = p_conversation_id and (student_id = p_student_id or preview_owner_id = p_student_id);
  select * into b from public.chatbots where id = v_bot_id for update;
  if not found then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if (c.is_preview and (b.status not in ('draft','active') or not public.chatbot_teacher_for_user(b.class_id, p_student_id)))
    or (not c.is_preview and not public.chatbot_student(b.id, p_student_id)) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  if c.closed_at is not null then raise exception 'This conversation was restarted'; end if;
  if p_content is null and c.opening_complete then raise exception 'Opening already complete'; end if;
  if p_content is not null and not c.opening_complete then raise exception 'Wait for the opening message'; end if;
  if p_content is not null and c.turns_used >= b.turn_limit then raise exception 'Turn limit reached'; end if;
  if c.pending_until > now() then raise exception 'A reply is already in progress'; end if;
  if p_content is not null and length(btrim(p_content)) not between 1 and 10000 then raise exception 'Message must contain 1 to 10000 characters'; end if;
  update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
  insert into public.chatbot_messages(id, conversation_id, role, content, status) values(p_message_id, c.id, case when p_content is null then 'assistant' else 'user' end, coalesce(btrim(p_content), 'Starting conversation...'), 'pending');
  update public.chatbot_conversations set pending_message_id = p_message_id, pending_until = now() + interval '120 seconds' where id = c.id returning * into c;
  return c;
end;
$$;

create or replace function public.finish_chatbot_turn(p_conversation_id uuid, p_message_id uuid, p_reply text, p_sources jsonb default '[]'::jsonb,
  p_search_entry_point text default null, p_invocation_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.chatbot_conversations; v_opening boolean;
begin
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if c.pending_message_id is distinct from p_message_id or c.closed_at is not null then raise exception 'Turn reservation expired'; end if;
  select role = 'assistant' into v_opening from public.chatbot_messages where id = p_message_id;
  if p_reply is null then
    update public.chatbot_messages set status = 'failed' where id = p_message_id;
  elsif v_opening then
    update public.chatbot_messages set status = 'complete', content = p_reply, sources = p_sources, search_entry_point = p_search_entry_point, ai_invocation_id = p_invocation_id where id = p_message_id;
  else
    update public.chatbot_messages set status = 'complete' where id = p_message_id;
    insert into public.chatbot_messages(conversation_id, role, content, sources, search_entry_point, ai_invocation_id)
      values(c.id, 'assistant', p_reply, p_sources, p_search_entry_point, p_invocation_id);
  end if;
  update public.chatbot_conversations set pending_message_id = null, pending_until = null,
    opening_complete = opening_complete or (v_opening and p_reply is not null),
    turns_used = turns_used + case when p_reply is null or v_opening then 0 else 1 end where id = c.id;
end;
$$;
