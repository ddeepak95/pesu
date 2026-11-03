-- Save the chosen language in the same transaction as conversation admission,
-- before another tab can reserve the opening message.
create function public.open_chatbot_with_language(
  p_chatbot_id uuid, p_actor_id uuid, p_preview boolean, p_restart boolean,
  p_expected_id uuid default null, p_language text default null
) returns public.chatbot_conversations
language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_previous_id uuid;
begin
  select * into b from public.chatbots where id = p_chatbot_id for update;
  if not found then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select id into v_previous_id from public.chatbot_conversations
    where chatbot_id = b.id and is_preview = p_preview and
      case when p_preview then preview_owner_id = p_actor_id
      else student_id = p_actor_id or public_participant_id = p_actor_id end
    order by sequence desc limit 1;
  if p_preview then
    c := public.open_chatbot_preview(p_chatbot_id, p_actor_id, p_restart, p_expected_id);
  else
    c := public.open_chatbot_conversation(p_chatbot_id, p_actor_id, p_restart, p_expected_id);
  end if;
  -- Resume never overrides an existing conversation's language.
  if c.id is distinct from v_previous_id and p_language is not null then
    if length(p_language) not between 2 and 35 then raise exception 'Invalid language'; end if;
    if b.lock_language and p_language <> b.language then
      raise exception 'Conversation language is locked by your teacher' using errcode = '42501';
    end if;
    update public.chatbot_conversations set language = p_language where id = c.id returning * into c;
  end if;
  return c;
end;
$$;
revoke all on function public.open_chatbot_with_language(uuid, uuid, boolean, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.open_chatbot_with_language(uuid, uuid, boolean, boolean, uuid, text) to service_role;
