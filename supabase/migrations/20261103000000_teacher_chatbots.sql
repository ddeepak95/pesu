-- Chatbots are class content; conversation writes are admitted by server-only RPCs.
alter table public.content_items drop constraint content_items_type_check;
alter table public.content_items add constraint content_items_type_check
  check (type in ('quiz','learning_content','formative_assignment','survey','chatbot'));

create table public.chatbots (
  id uuid primary key default gen_random_uuid(),
  chatbot_id text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  topic_title text not null check (length(btrim(topic_title)) between 1 and 500),
  language text not null,
  system_prompt text not null check (length(btrim(system_prompt)) between 1 and 20000),
  turn_limit integer not null default 20 check (turn_limit between 1 and 1000),
  max_restarts integer default 0 check (max_restarts between 0 and 1000),
  web_search boolean not null default false,
  image_search boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','deleted')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chatbots_class_idx on public.chatbots(class_id);

create table public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  turns_used integer not null default 0 check (turns_used >= 0),
  closed_at timestamptz,
  pending_message_id uuid,
  pending_until timestamptz,
  created_at timestamptz not null default now(),
  unique(chatbot_id, student_id, sequence)
);
create unique index chatbot_one_open_conversation on public.chatbot_conversations(chatbot_id, student_id) where closed_at is null;

create table public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) > 0),
  status text not null default 'complete' check (status in ('pending','complete','failed')),
  sources jsonb not null default '[]'::jsonb,
  search_entry_point text,
  ai_invocation_id uuid references public.ai_invocations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index chatbot_messages_conversation_idx on public.chatbot_messages(conversation_id, created_at, id);

create function public.chatbot_teacher(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_class_co_teacher(p_class_id) or public.is_class_institution_admin(p_class_id) or public.is_platform_super_admin();
$$;

-- Matches allowed_content_types inheritance: an institution must explicitly enable it;
-- an existing class override can narrow the institution's set.
create function public.chatbot_creation_allowed(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.classes c
    join public.setting_values i on i.scope = 'institution' and i.scope_id = c.institution_id and i.key = 'allowed_content_types'
    left join public.setting_values s on s.scope = 'class' and s.scope_id = c.id and s.key = 'allowed_content_types'
    where c.id = p_class_id and i.value ? 'chatbot' and (s.value is null or s.value ? 'chatbot'));
$$;

create function public.chatbot_student(p_chatbot_id uuid, p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.chatbots b
    join public.classes c on c.id = b.class_id and c.status = 'active'
    join public.class_students s on s.class_id = b.class_id and s.student_id = p_student_id and s.status = 'active'
    join public.content_items ci on ci.ref_id = b.id and ci.type = 'chatbot' and ci.class_id = b.class_id and ci.status = 'active'
    join public.class_group_memberships m on m.class_id = b.class_id and m.group_id = ci.class_group_id and m.student_id = p_student_id
    where b.id = p_chatbot_id and b.status = 'active');
$$;

alter table public.chatbots enable row level security;
alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;
create policy chatbot_read on public.chatbots for select to authenticated
  using (public.chatbot_teacher(class_id) or public.chatbot_student(id, (select auth.uid())));
create policy chatbot_conversation_read on public.chatbot_conversations for select to authenticated
  using (exists(select 1 from public.chatbots b where b.id = chatbot_conversations.chatbot_id and
    (public.chatbot_teacher(b.class_id) or (chatbot_conversations.student_id = (select auth.uid()) and public.chatbot_student(b.id, (select auth.uid()))))));
create policy chatbot_message_read on public.chatbot_messages for select to authenticated
  using (exists(select 1 from public.chatbot_conversations c where c.id = chatbot_messages.conversation_id));
revoke all on public.chatbots, public.chatbot_conversations, public.chatbot_messages from anon, authenticated;
grant select on public.chatbots, public.chatbot_conversations, public.chatbot_messages to authenticated;
grant all on public.chatbots, public.chatbot_conversations, public.chatbot_messages to service_role;

-- Keep the existing validation trigger and add the new reference type.
create or replace function public.content_items_validate_ref() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.type = 'quiz' then
    if not exists(select 1 from public.quizzes where id = new.ref_id and class_id = new.class_id) then raise exception 'Quiz not found for class'; end if;
  elsif new.type = 'learning_content' then
    if not exists(select 1 from public.learning_contents where id = new.ref_id and class_id = new.class_id) then raise exception 'Content not found for class'; end if;
  elsif new.type = 'formative_assignment' then
    if not exists(select 1 from public.assignments where id = new.ref_id and class_id = new.class_id) then raise exception 'Activity not found for class'; end if;
  elsif new.type = 'survey' then
    if not exists(select 1 from public.surveys where id = new.ref_id and class_id = new.class_id) then raise exception 'Survey not found for class'; end if;
  elsif new.type = 'chatbot' then
    if not exists(select 1 from public.chatbots where id = new.ref_id and class_id = new.class_id) then raise exception 'Chatbot not found for class'; end if;
    if tg_op = 'INSERT' and not public.chatbot_creation_allowed(new.class_id) then raise exception 'Chatbots are not enabled for this class'; end if;
  else raise exception 'Unknown content type';
  end if;
  return new;
end;
$$;

-- Configuration + its first placement commit together, including duplication.
create function public.save_chatbot(p_class_id uuid, p_group_id uuid, p_config jsonb, p_id uuid default null, p_placement jsonb default '{}'::jsonb)
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
    insert into public.chatbots(class_id, title, topic_title, language, system_prompt, turn_limit, max_restarts, web_search, image_search, status, created_by)
      values(p_class_id, btrim(p_config->>'title'), btrim(p_config->>'topic_title'), p_config->>'language', btrim(p_config->>'system_prompt'),
        (p_config->>'turn_limit')::integer, (p_config->>'max_restarts')::integer, (p_config->>'web_search')::boolean, (p_config->>'image_search')::boolean, p_config->>'status', auth.uid()) returning * into v_bot;
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
      system_prompt = btrim(p_config->>'system_prompt'), turn_limit = (p_config->>'turn_limit')::integer, max_restarts = (p_config->>'max_restarts')::integer,
      web_search = (p_config->>'web_search')::boolean, image_search = (p_config->>'image_search')::boolean, status = p_config->>'status', updated_at = now()
      where id = p_id and class_id = p_class_id and status <> 'deleted' returning * into v_bot;
    if not found then raise exception 'Chatbot not found'; end if;
    update public.content_items set status = v_bot.status, updated_at = now() where ref_id = v_bot.id and type = 'chatbot' and status <> 'deleted';
  end if;
  return v_bot;
end;
$$;

create function public.delete_chatbot(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from public.chatbots where id = p_id for update;
  if auth.uid() is null or not public.chatbot_teacher(v_class) then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.chatbots set status = 'deleted', updated_at = now() where id = p_id;
  update public.content_items set status = 'deleted', updated_at = now() where ref_id = p_id and type = 'chatbot';
end;
$$;

-- Private RPCs are callable only by the authenticated application server.
-- Both restarts and turn reservations lock the chatbot first, then the student's
-- conversation. Configuration edits take the same chatbot lock.
create function public.open_chatbot_conversation(p_chatbot_id uuid, p_student_id uuid, p_restart boolean, p_expected_id uuid default null)
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
    if b.max_restarts is not null and c.sequence > b.max_restarts then raise exception 'Restart limit reached'; end if;
    update public.chatbot_messages set status = 'failed' where id = c.pending_message_id and status = 'pending';
    update public.chatbot_conversations set closed_at = now(), pending_message_id = null, pending_until = null where id = c.id;
  elsif p_restart then raise exception 'Start the initial conversation first';
  end if;
  insert into public.chatbot_conversations(chatbot_id, student_id, sequence) values(b.id, p_student_id, coalesce(c.sequence, 0) + 1) returning * into c;
  return c;
end;
$$;

create function public.reserve_chatbot_turn(p_conversation_id uuid, p_student_id uuid, p_message_id uuid, p_content text)
returns public.chatbot_conversations language plpgsql security definer set search_path = public as $$
declare b public.chatbots; c public.chatbot_conversations; v_bot_id uuid;
begin
  select chatbot_id into v_bot_id from public.chatbot_conversations where id = p_conversation_id and student_id = p_student_id;
  select * into b from public.chatbots where id = v_bot_id for update;
  if not found or not public.chatbot_student(b.id, p_student_id) then raise exception 'Chatbot unavailable' using errcode = '42501'; end if;
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
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

create function public.finish_chatbot_turn(p_conversation_id uuid, p_message_id uuid, p_reply text, p_sources jsonb default '[]'::jsonb,
  p_search_entry_point text default null, p_invocation_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.chatbot_conversations;
begin
  select * into c from public.chatbot_conversations where id = p_conversation_id for update;
  if c.pending_message_id is distinct from p_message_id or c.closed_at is not null then raise exception 'Turn reservation expired'; end if;
  if p_reply is null then
    update public.chatbot_messages set status = 'failed' where id = p_message_id;
  else
    update public.chatbot_messages set status = 'complete' where id = p_message_id;
    insert into public.chatbot_messages(conversation_id, role, content, sources, search_entry_point, ai_invocation_id)
      values(c.id, 'assistant', p_reply, p_sources, p_search_entry_point, p_invocation_id);
  end if;
  update public.chatbot_conversations set pending_message_id = null, pending_until = null,
    turns_used = turns_used + case when p_reply is null then 0 else 1 end where id = c.id;
end;
$$;

revoke all on function public.save_chatbot(uuid, uuid, jsonb, uuid, jsonb), public.delete_chatbot(uuid) from public, anon;
grant execute on function public.save_chatbot(uuid, uuid, jsonb, uuid, jsonb), public.delete_chatbot(uuid) to authenticated;
revoke all on function public.open_chatbot_conversation(uuid, uuid, boolean, uuid), public.reserve_chatbot_turn(uuid, uuid, uuid, text),
  public.finish_chatbot_turn(uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.open_chatbot_conversation(uuid, uuid, boolean, uuid), public.reserve_chatbot_turn(uuid, uuid, uuid, text),
  public.finish_chatbot_turn(uuid, uuid, text, jsonb, text, uuid) to service_role;
revoke all on function public.chatbot_teacher(uuid), public.chatbot_creation_allowed(uuid), public.chatbot_student(uuid, uuid) from public, anon;
grant execute on function public.chatbot_teacher(uuid), public.chatbot_creation_allowed(uuid), public.chatbot_student(uuid, uuid) to authenticated, service_role;
