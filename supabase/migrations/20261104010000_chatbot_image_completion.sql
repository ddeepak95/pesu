-- Capture the inserted assistant ID directly: timestamps can tie within a transaction.
create or replace function public.finish_chatbot_turn_images(p_conversation_id uuid, p_message_id uuid, p_reply text,
  p_sources jsonb, p_search_entry_point text, p_invocation_id uuid,
  p_image_mappings jsonb, p_matching_invocation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.chatbot_conversations; opening boolean;
begin
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if not found or c.pending_message_id is distinct from p_message_id or c.closed_at is not null then
    raise exception 'Turn reservation expired';
  end if;
  if p_reply is null or p_image_mappings is null or jsonb_typeof(p_image_mappings) <> 'array' then
    raise exception 'Invalid image reply';
  end if;
  if exists(select 1 from jsonb_array_elements(p_image_mappings) x where
    coalesce(x->>'action','') not in ('append','replace') or coalesce(x->>'original_url','') !~ '^https?://' or
    coalesce(x->>'occurrence_id','') !~ '^image_[0-9]+$' or not exists(select 1 from public.chatbot_images i
      where i.id = (x->>'image_id')::uuid and i.chatbot_id = c.chatbot_id and i.status in ('ready','removed'))) then
    raise exception 'Invalid image mapping';
  end if;
  select role = 'assistant' into opening from public.chatbot_messages where id = p_message_id and conversation_id = c.id;
  if opening then
    update public.chatbot_messages set status = 'complete', content = p_reply, sources = p_sources,
      search_entry_point = p_search_entry_point, ai_invocation_id = p_invocation_id,
      image_mappings = p_image_mappings, image_matching_invocation_id = p_matching_invocation_id where id = p_message_id;
  else
    update public.chatbot_messages set status = 'complete' where id = p_message_id;
    insert into public.chatbot_messages(conversation_id, role, content, sources, search_entry_point, ai_invocation_id, image_mappings, image_matching_invocation_id)
      values(c.id, 'assistant', p_reply, p_sources, p_search_entry_point, p_invocation_id, p_image_mappings, p_matching_invocation_id);
  end if;
  update public.chatbot_conversations set pending_message_id = null, pending_until = null,
    opening_complete = true, turns_used = turns_used + case when opening then 0 else 1 end where id = c.id;
end;
$$;
