-- Public links use private, cookie-authenticated respondent sessions.
alter table public.chatbots add column is_public boolean not null default false;
create table public.chatbot_public_participants (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  unique(chatbot_id, id)
);
alter table public.chatbot_public_participants enable row level security;
revoke all on public.chatbot_public_participants from anon, authenticated;
grant select(id, chatbot_id, name, created_at) on public.chatbot_public_participants to authenticated;
grant all on public.chatbot_public_participants to service_role;
create policy chatbot_public_participant_teacher_read on public.chatbot_public_participants for select to authenticated
using (exists(select 1 from public.chatbots b where b.id = chatbot_public_participants.chatbot_id and public.chatbot_teacher(b.class_id)));
alter table public.chatbot_conversations add column public_participant_id uuid;
alter table public.chatbot_conversations add constraint chatbot_public_participant_fk
  foreign key (chatbot_id, public_participant_id) references public.chatbot_public_participants(chatbot_id, id) on delete cascade;
alter table public.chatbot_conversations drop constraint chatbot_conversation_owner_check;
alter table public.chatbot_conversations add constraint chatbot_conversation_owner_check check (
  (is_preview and preview_owner_id is not null and student_id is null and public_participant_id is null) or
  (not is_preview and preview_owner_id is null and num_nonnulls(student_id, public_participant_id) = 1));
create unique index chatbot_public_sequence on public.chatbot_conversations(chatbot_id, public_participant_id, sequence) where public_participant_id is not null;
create unique index chatbot_one_open_public on public.chatbot_conversations(chatbot_id, public_participant_id) where public_participant_id is not null and closed_at is null;

-- Actor IDs for these RPCs come only from verified server authentication.
create function public.chatbot_participant_allowed(p_chatbot_id uuid, p_actor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select public.chatbot_student(p_chatbot_id, p_actor_id) or exists (
   select 1 from public.chatbot_public_participants p
   join public.chatbots b on b.id = p.chatbot_id
   join public.classes c on c.id = b.class_id
   where p.id = p_actor_id and b.id = p_chatbot_id and b.is_public and b.status = 'active' and c.status = 'active');
$$;
revoke all on function public.chatbot_participant_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chatbot_participant_allowed(uuid, uuid) to service_role;

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
    insert into public.chatbots(class_id, title, topic_title, language, system_prompt, turn_limit, max_conversations, web_search, image_search, lock_language, is_public, status, created_by)
      values(p_class_id, btrim(p_config->>'title'), btrim(p_config->>'title'), p_config->>'language', btrim(p_config->>'system_prompt'),
        (p_config->>'turn_limit')::integer, (p_config->>'max_conversations')::integer, (p_config->>'web_search')::boolean, (p_config->>'image_search')::boolean, coalesce((p_config->>'lock_language')::boolean, true), coalesce((p_config->>'is_public')::boolean, false), p_config->>'status', auth.uid()) returning * into v_bot;
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
      web_search = (p_config->>'web_search')::boolean, image_search = (p_config->>'image_search')::boolean, lock_language = coalesce((p_config->>'lock_language')::boolean, true), is_public = coalesce((p_config->>'is_public')::boolean, false), status = p_config->>'status', updated_at = now()
      where id = p_id and class_id = p_class_id and status <> 'deleted' returning * into v_bot;
    if not found then raise exception 'Chatbot not found'; end if;
    update public.content_items set status = v_bot.status, updated_at = now() where ref_id = v_bot.id and type = 'chatbot' and status <> 'deleted';
  end if;
  return v_bot;
end;
$$;

create or replace function public.open_chatbot_conversation(p_chatbot_id uuid, p_student_id uuid, p_restart boolean, p_expected_id uuid default null)
returns public.chatbot_conversations language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations;
begin
  select * into b from public.chatbots where id = p_chatbot_id for update;
  if not found or not public.chatbot_participant_allowed(p_chatbot_id, p_student_id) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where chatbot_id = b.id and (student_id = p_student_id or public_participant_id = p_student_id) order by sequence desc limit 1 for update;
  if c.id is not null then
    if not p_restart then return c; end if;
    if p_expected_id is distinct from c.id then raise exception 'Conversation changed. Refresh and try again.'; end if;
    if c.pending_until > now() then raise exception 'Wait for the current reply before restarting'; end if;
    if b.max_conversations is not null and c.sequence >= b.max_conversations then raise exception 'Conversation limit reached'; end if;
    update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
    update public.chatbot_conversations set closed_at = now(), pending_message_id = null, pending_until = null where id = c.id;
  elsif p_restart then raise exception 'Start the initial conversation first';
  end if;
  insert into public.chatbot_conversations(chatbot_id, student_id, public_participant_id, sequence) values(b.id,
    case when exists(select 1 from public.chatbot_public_participants where id = p_student_id and chatbot_id = b.id) then null else p_student_id end,
    case when exists(select 1 from public.chatbot_public_participants where id = p_student_id and chatbot_id = b.id) then p_student_id else null end, coalesce(c.sequence, 0) + 1) returning * into c;
  return c;
end;
$$;

create or replace function public.reserve_chatbot_turn(p_conversation_id uuid, p_student_id uuid, p_message_id uuid, p_content text)
returns public.chatbot_conversations language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_bot_id uuid;
begin
  select chatbot_id into v_bot_id from public.chatbot_conversations where id = p_conversation_id and (student_id = p_student_id or preview_owner_id = p_student_id or public_participant_id = p_student_id);
  select * into b from public.chatbots where id = v_bot_id for update;
  if not found then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if (c.is_preview and (b.status not in ('draft','active') or not public.chatbot_teacher_for_user(b.class_id, p_student_id)))
    or (not c.is_preview and not public.chatbot_participant_allowed(b.id, p_student_id)) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
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

create or replace function public.set_chatbot_conversation_language(p_conversation_id uuid, p_actor_id uuid, p_language text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_bot_id uuid;
begin
  select chatbot_id into v_bot_id from public.chatbot_conversations where id = p_conversation_id and (student_id = p_actor_id or preview_owner_id = p_actor_id or public_participant_id = p_actor_id);
  select * into b from public.chatbots where id = v_bot_id for update;
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if (c.is_preview and (b.status not in ('draft','active') or not public.chatbot_teacher_for_user(b.class_id, p_actor_id)))
    or (not c.is_preview and not public.chatbot_participant_allowed(b.id, p_actor_id)) then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if b.lock_language then raise exception 'Conversation language is locked by your teacher' using errcode = '42501'; end if;
  if c.closed_at is not null then raise exception 'This conversation was restarted'; end if;
  if c.pending_until > now() then raise exception 'Wait for the current reply before changing language'; end if;
  if p_language is null or length(p_language) not between 2 and 35 then raise exception 'Invalid language'; end if;
  update public.chatbot_conversations set language = p_language where id = c.id;
end;
$$;
revoke all on function public.set_chatbot_conversation_language(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_chatbot_conversation_language(uuid, uuid, text) to service_role;
