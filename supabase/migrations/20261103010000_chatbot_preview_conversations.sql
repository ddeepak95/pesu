-- Preserve existing student history while introducing total conversation allowances.
alter table public.chatbots drop constraint chatbots_max_restarts_check;
alter table public.chatbots rename column max_restarts to max_conversations;
update public.chatbots set max_conversations = max_conversations + 1;
alter table public.chatbots alter column max_conversations set default 1;
alter table public.chatbots add constraint chatbots_max_conversations_check check (max_conversations between 1 and 1001);
alter table public.chatbot_conversations alter column student_id drop not null;
alter table public.chatbot_conversations add column is_preview boolean not null default false;
alter table public.chatbot_conversations add column preview_owner_id uuid references auth.users(id) on delete cascade;
alter table public.chatbot_conversations add constraint chatbot_conversation_owner_check check (
  (is_preview and preview_owner_id is not null and student_id is null) or
  (not is_preview and student_id is not null and preview_owner_id is null));
create unique index chatbot_preview_sequence on public.chatbot_conversations(chatbot_id, preview_owner_id, sequence) where is_preview;
create unique index chatbot_one_open_preview on public.chatbot_conversations(chatbot_id, preview_owner_id) where is_preview and closed_at is null;

-- Used only by service RPCs, whose actor comes from verified server authentication.
create function public.chatbot_teacher_for_user(p_class_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.class_teachers where class_id = p_class_id and teacher_id = p_user_id)
 or exists(select 1 from public.classes c join public.institution_members m on m.institution_id = c.institution_id
   where c.id = p_class_id and m.user_id = p_user_id and m.role = 'admin')
 or exists(select 1 from public.platform_super_admins where user_id = p_user_id);
$$;
revoke all on function public.chatbot_teacher_for_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chatbot_teacher_for_user(uuid, uuid) to service_role;

drop policy chatbot_conversation_read on public.chatbot_conversations;
create policy chatbot_conversation_read on public.chatbot_conversations for select to authenticated using (
 exists(select 1 from public.chatbots b where b.id = chatbot_conversations.chatbot_id and
   case when is_preview then preview_owner_id = (select auth.uid()) and public.chatbot_teacher(b.class_id)
   else public.chatbot_teacher(b.class_id) or (student_id = (select auth.uid()) and public.chatbot_student(b.id, (select auth.uid()))) end));

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
    insert into public.chatbots(class_id, title, topic_title, language, system_prompt, turn_limit, max_conversations, web_search, image_search, status, created_by)
      values(p_class_id, btrim(p_config->>'title'), btrim(p_config->>'topic_title'), p_config->>'language', btrim(p_config->>'system_prompt'),
        (p_config->>'turn_limit')::integer, (p_config->>'max_conversations')::integer, (p_config->>'web_search')::boolean, (p_config->>'image_search')::boolean, p_config->>'status', auth.uid()) returning * into v_bot;
    -- Serialize placement positions against other chatbot creates in this group.
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
    select coalesce(max(position), -1) + 1 into v_position from public.content_items where class_group_id = p_group_id and status in ('active','draft');
    insert into public.content_items(content_item_id, class_id, class_group_id, type, ref_id, position, created_by, status,
      due_at, lock_after_complete, require_teacher_unlock, unlock_days_after_previous)
      values(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), p_class_id, p_group_id, 'chatbot', v_bot.id, v_position, auth.uid(), v_bot.status,
        (p_placement->>'due_at')::timestamptz, coalesce((p_placement->>'lock_after_complete')::boolean, false),
        coalesce((p_placement->>'require_teacher_unlock')::boolean, false), (p_placement->>'unlock_days_after_previous')::integer);
  else
    update public.chatbots set title = btrim(p_config->>'title'), topic_title = btrim(p_config->>'topic_title'), language = p_config->>'language',
      system_prompt = btrim(p_config->>'system_prompt'), turn_limit = (p_config->>'turn_limit')::integer, max_conversations = (p_config->>'max_conversations')::integer,
      web_search = (p_config->>'web_search')::boolean, image_search = (p_config->>'image_search')::boolean, status = p_config->>'status', updated_at = now()
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
  if not found or not public.chatbot_student(p_chatbot_id, p_student_id) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where chatbot_id = b.id and student_id = p_student_id order by sequence desc limit 1 for update;
  if c.id is not null then
    if not p_restart then return c; end if;
    if p_expected_id is distinct from c.id then raise exception 'Conversation changed. Refresh and try again.'; end if;
    if c.pending_until > now() then raise exception 'Wait for the current reply before restarting'; end if;
    if b.max_conversations is not null and c.sequence >= b.max_conversations then raise exception 'Conversation limit reached'; end if;
    update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
    update public.chatbot_conversations set closed_at = now(), pending_message_id = null, pending_until = null where id = c.id;
  elsif p_restart then raise exception 'Start the initial conversation first';
  end if;
  insert into public.chatbot_conversations(chatbot_id, student_id, sequence) values(b.id, p_student_id, coalesce(c.sequence, 0) + 1) returning * into c;
  return c;
end;
$$;

create or replace function public.open_chatbot_preview(p_chatbot_id uuid, p_student_id uuid, p_restart boolean, p_expected_id uuid default null)
returns public.chatbot_conversations language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations;
begin
  select * into b from public.chatbots where id = p_chatbot_id for update;
  if not found or b.status not in ('draft','active') or not public.chatbot_teacher_for_user(b.class_id, p_student_id) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where chatbot_id = b.id and is_preview and preview_owner_id = p_student_id order by sequence desc limit 1 for update;
  if c.id is not null then
    if not p_restart then return c; end if;
    if p_expected_id is distinct from c.id then raise exception 'Conversation changed. Refresh and try again.'; end if;
    if c.pending_until > now() then raise exception 'Wait for the current reply before restarting'; end if;
    update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
    update public.chatbot_conversations set closed_at = now(), pending_message_id = null, pending_until = null where id = c.id;
  elsif p_restart then raise exception 'Start the initial conversation first';
  end if;
  insert into public.chatbot_conversations(chatbot_id, preview_owner_id, is_preview, sequence) values(b.id, p_student_id, true, coalesce(c.sequence, 0) + 1) returning * into c;
  return c;
end;
$$;
revoke all on function public.open_chatbot_preview(uuid, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.open_chatbot_preview(uuid, uuid, boolean, uuid) to service_role;

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
  if c.turns_used >= b.turn_limit then raise exception 'Turn limit reached'; end if;
  if c.pending_until > now() then raise exception 'A reply is already in progress'; end if;
  if length(btrim(p_content)) not between 1 and 10000 then raise exception 'Message must contain 1 to 10000 characters'; end if;
  update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
  insert into public.chatbot_messages(id, conversation_id, role, content, status) values(p_message_id, c.id, 'user', btrim(p_content), 'pending');
  update public.chatbot_conversations set pending_message_id = p_message_id, pending_until = now() + interval '120 seconds' where id = c.id returning * into c;
  return c;
end;
$$;
