-- Run with: supabase test db supabase/tests/chatbots.test.sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- Fixture helper exercises the real opening reservation/completion path.
create function pg_temp.greet(p_id uuid, p_actor uuid) returns void language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.reserve_chatbot_turn(p_id, p_actor, v_id, null);
  perform public.finish_chatbot_turn(p_id, v_id, 'Welcome! What would you like to explore?');
end; $$;


-- All fixtures, including auth users, are rolled back at the end.
select set_config('test.teacher', gen_random_uuid()::text, true);
select set_config('test.student', gen_random_uuid()::text, true);
select set_config('test.other', gen_random_uuid()::text, true);
select set_config('test.admin', gen_random_uuid()::text, true);
select set_config('test.institution', gen_random_uuid()::text, true);
select set_config('test.class', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('test.teacher')::uuid), (current_setting('test.student')::uuid), (current_setting('test.other')::uuid), (current_setting('test.admin')::uuid);
insert into public.institutions(id, name) values(current_setting('test.institution')::uuid, 'Chatbot test institution');
insert into public.institution_members(institution_id, user_id) values(current_setting('test.institution')::uuid, current_setting('test.admin')::uuid);
insert into public.classes(id, name, class_id, created_by, institution_id)
values(current_setting('test.class')::uuid, 'Chatbot tests', gen_random_uuid()::text, current_setting('test.teacher')::uuid, current_setting('test.institution')::uuid);
insert into public.class_students(class_id, student_id) values(current_setting('test.class')::uuid, current_setting('test.student')::uuid), (current_setting('test.class')::uuid, current_setting('test.other')::uuid);
select set_config('test.group', (select id::text from public.class_groups where class_id = current_setting('test.class')::uuid limit 1), true);
select set_config('test.config', '{"title":"Tutor","topic_title":"Physics","language":"en","system_prompt":"Teach {topic_title} in {language}","turn_limit":1,"max_conversations":1,"web_search":false,"image_search":false,"status":"active"}', true);

select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select throws_ok($$select public.save_chatbot(current_setting('test.class')::uuid,current_setting('test.group')::uuid,current_setting('test.config')::jsonb)$$, '42501', 'Chatbots are not enabled for this class', 'Chatbots disabled by default');
reset role;
insert into public.setting_values(scope,scope_id,key,value,allow_admin_edit,allow_child_override) values('institution',current_setting('test.institution')::uuid,'allowed_content_types','["chatbot","learning_content"]',true,true);
set local role authenticated;
select set_config('test.bot', (public.save_chatbot(current_setting('test.class')::uuid,current_setting('test.group')::uuid,current_setting('test.config')::jsonb)).id::text, true);
select is((select count(*)::integer from public.content_items where type='chatbot' and ref_id=current_setting('test.bot')::uuid), 1, 'Create atomically creates a placement');
select is((select max_conversations from public.chatbots where id=current_setting('test.bot')::uuid), 1, 'One conversation configuration stored');
select throws_ok($$select public.save_chatbot(current_setting('test.class')::uuid,gen_random_uuid(),current_setting('test.config')::jsonb)$$, 'P0001', 'Choose a group in this class', 'Invalid group rejected');
select is((select count(*)::integer from public.chatbots where class_id=current_setting('test.class')::uuid), 1, 'Failed create leaves no orphan chatbot');

select set_config('request.jwt.claim.sub', current_setting('test.student'), true);
select is((select count(*)::integer from public.chatbots where id=current_setting('test.bot')::uuid), 1, 'Assigned student can read chatbot');
select throws_ok($$select public.save_chatbot(current_setting('test.class')::uuid,current_setting('test.group')::uuid,current_setting('test.config')::jsonb)$$, '42501', 'Not authorized', 'Student cannot create chatbot');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,false)$$, '42501', 'permission denied for function open_chatbot_conversation', 'Student cannot bypass server admission');
reset role;

select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,false)).id::text, true);
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),'Too early')$$, 'P0001', 'Wait for the opening message', 'Student cannot precede the greeting');
select set_config('test.opening', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,current_setting('test.opening')::uuid,null);
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),null)$$, 'P0001', 'A reply is already in progress', 'Only one greeting can be generated concurrently');
select public.finish_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.opening')::uuid,null);
select ok((select not opening_complete and turns_used=0 from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 'Failed opening remains retryable without a student turn');
select pg_temp.greet(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid);
select ok((select opening_complete and turns_used=0 from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 'Successful opening does not consume a turn');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),null)$$, 'P0001', 'Opening already complete', 'Completed greeting cannot be duplicated');

select is((select sequence from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 1, 'Initial conversation is sequence one');
select is((public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,false)).id::text, current_setting('test.conversation'), 'Resume does not create another conversation');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)$$, 'P0001', 'Conversation limit reached', 'One conversation blocks another start');

select set_config('test.message', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,current_setting('test.message')::uuid,'Explain gravity');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),'Another message')$$, 'P0001', 'A reply is already in progress', 'Pending reservation prevents overlapping turns');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)$$, 'P0001', 'Wait for the current reply before restarting', 'Cannot restart during a reply');
select public.finish_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,null);
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 0, 'Provider failure does not consume a turn');
select is((select status from public.chatbot_messages where id=current_setting('test.message')::uuid), 'failed', 'Failed message remains visible');
select set_config('test.message', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,current_setting('test.message')::uuid,'Explain gravity');
select public.finish_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,'Gravity attracts masses.');
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 1, 'Successful reply counts one student turn');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),'One more')$$, 'P0001', 'Turn limit reached', 'Turn limit enforced server-side');

select set_config('request.jwt.claim.sub', current_setting('test.other'), true);
set local role authenticated;
select is((select count(*)::integer from public.chatbot_conversations where chatbot_id=current_setting('test.bot')::uuid), 0, 'Other student cannot read conversation');
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 0, 'Other student cannot read transcript');
select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
select is((select count(*)::integer from public.chatbot_conversations where chatbot_id=current_setting('test.bot')::uuid), 1, 'Class teacher can review conversations');
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 5, 'Teacher can read complete and failed messages');
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 5, 'Institution admin can review transcripts');
reset role;

update public.chatbots set max_conversations=3 where id=current_setting('test.bot')::uuid;
select set_config('test.old', current_setting('test.conversation'), true);
select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)).id::text, true);
select pg_temp.greet(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid);
select is((select sequence from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 2, 'First restart creates conversation two');
select ok((select closed_at is not null from public.chatbot_conversations where id=current_setting('test.old')::uuid), 'Restart closes previous conversation');
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 0, 'Restart gets a fresh turn allowance');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.old')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),'Cannot continue')$$, 'P0001', 'This conversation was restarted', 'Closed conversations reject messages');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.old')::uuid)$$, 'P0001', 'Conversation changed. Refresh and try again.', 'Stale restart request cannot consume another allowance');
select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)).id::text, true);
select pg_temp.greet(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid);
select is((select sequence from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 3, 'Allowance of three permits three conversations');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)$$, 'P0001', 'Conversation limit reached', 'Finite conversation allowance exhausted');
update public.chatbots set max_conversations=1 where id=current_setting('test.bot')::uuid;
select is((select count(*)::integer from public.chatbot_conversations where chatbot_id=current_setting('test.bot')::uuid), 3, 'Lowering conversation limit preserves history');
update public.chatbots set max_conversations=null where id=current_setting('test.bot')::uuid;
select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,true,current_setting('test.conversation')::uuid)).id::text, true);
select pg_temp.greet(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid);
select is((select sequence from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 4, 'Unlimited conversations permits another conversation');

-- Configuration updates apply to the next admission without erasing old data.
update public.chatbots set turn_limit=3 where id=current_setting('test.bot')::uuid;
update public.chatbot_conversations set turns_used=2 where id=current_setting('test.conversation')::uuid;
update public.chatbots set turn_limit=1 where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,gen_random_uuid(),'Over the new limit')$$, 'P0001', 'Turn limit reached', 'Lowered turn limit takes effect immediately');
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 2, 'Lowering limit preserves used turns');

-- Language permissions are enforced in storage, including direct server RPC calls.
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,'fr')$$, '42501', 'Conversation language is locked by your teacher', 'Language is locked by default');
update public.chatbots set lock_language=false where id=current_setting('test.bot')::uuid;
select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,'fr');
select is((select language from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 'fr', 'Student language choice persists');
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.other')::uuid,'de')$$, '42501', 'Conversation unavailable', 'Other student cannot change conversation language');
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.old')::uuid,current_setting('test.student')::uuid,'de')$$, 'P0001', 'This conversation was restarted', 'Closed conversation language cannot be changed');
update public.chatbots set lock_language=true where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,'de')$$, '42501', 'Conversation language is locked by your teacher', 'Teacher relocking language takes effect immediately');

-- Preview admission permits drafts, is owner-only, and does not use student allowances.
update public.chatbots set status='draft', max_conversations=1 where id=current_setting('test.bot')::uuid;
select set_config('test.preview', (public.open_chatbot_preview(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,false)).id::text, true);
select pg_temp.greet(current_setting('test.preview')::uuid,current_setting('test.teacher')::uuid);
select ok((select is_preview and student_id is null and preview_owner_id=current_setting('test.teacher')::uuid from public.chatbot_conversations where id=current_setting('test.preview')::uuid), 'Preview has a distinct owner and no student association');
select is((public.open_chatbot_preview(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,false)).id::text, current_setting('test.preview'), 'Reopening preview resumes the same conversation');
select throws_ok($$select public.open_chatbot_preview(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,false)$$, '42501', 'Chatbot unavailable', 'Students cannot create previews');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.preview')::uuid,current_setting('test.admin')::uuid,gen_random_uuid(),'Wrong owner')$$, '42501', 'Chatbot unavailable', 'Other administrators cannot send preview turns');
select set_config('test.message', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.preview')::uuid,current_setting('test.teacher')::uuid,current_setting('test.message')::uuid,'Preview message');
select public.finish_chatbot_turn(current_setting('test.preview')::uuid,current_setting('test.message')::uuid,'Preview reply');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.preview')::uuid,current_setting('test.teacher')::uuid,gen_random_uuid(),'Over cap')$$, 'P0001', 'Turn limit reached', 'Preview obeys turn limit');
select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.preview')::uuid), 3, 'Owner reads preview transcript');
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.preview')::uuid), 0, 'Other admin cannot read preview transcript');
reset role;
update public.chatbots set status='active' where id=current_setting('test.bot')::uuid;
select set_config('request.jwt.claim.sub', current_setting('test.student'), true);
set local role authenticated;
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.preview')::uuid), 0, 'Student cannot read preview of published chatbot');
select is((select count(*)::integer from public.chatbot_conversations where chatbot_id=current_setting('test.bot')::uuid), 4, 'Previews never appear in student history');
reset role;
select set_config('test.preview_old', current_setting('test.preview'), true);
select set_config('test.preview', (public.open_chatbot_preview(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,true,current_setting('test.preview')::uuid)).id::text, true);
select pg_temp.greet(current_setting('test.preview')::uuid,current_setting('test.teacher')::uuid);
select ok(current_setting('test.preview') <> current_setting('test.preview_old'), 'Preview restart creates a new UUID');
select is((select sequence from public.chatbot_conversations where id=current_setting('test.preview')::uuid), 2, 'Preview restarts ignore student conversation cap');
select ok((select closed_at is not null from public.chatbot_conversations where id=current_setting('test.preview_old')::uuid), 'Restart preserves and closes previous preview');
select is((select count(*)::integer from public.chatbot_conversations where chatbot_id=current_setting('test.bot')::uuid and not is_preview), 4, 'Preview does not consume student allowance');
select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select is((public.save_chatbot(current_setting('test.class')::uuid,null,current_setting('test.config')::jsonb || '{"status":"draft"}',current_setting('test.bot')::uuid)).id::text, current_setting('test.bot'), 'Preview save updates same chatbot');
select is((select count(*)::integer from public.chatbots where class_id=current_setting('test.class')::uuid), 1, 'Repeat save creates no duplicate chatbot');
select is((select count(*)::integer from public.content_items where ref_id=current_setting('test.bot')::uuid), 1, 'Repeat save creates no duplicate placement');
select is((public.save_chatbot(current_setting('test.class')::uuid,null,current_setting('test.config')::jsonb,current_setting('test.bot')::uuid)).status, 'active', 'Saved draft can be published');
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select public.delete_chatbot(current_setting('test.bot')::uuid);
select is((select status from public.chatbots where id=current_setting('test.bot')::uuid), 'deleted', 'Teacher can soft-delete chatbot');
select is((select count(*)::integer from public.content_items where ref_id=current_setting('test.bot')::uuid and status='deleted'), 1, 'Deletion soft-deletes placements');
select set_config('request.jwt.claim.sub', current_setting('test.student'), true);
select is((select count(*)::integer from public.chatbots where id=current_setting('test.bot')::uuid), 0, 'Deleted chatbot unavailable to student');
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.old')::uuid), 0, 'Deleted chatbot transcript is no longer student-accessible');
reset role;
select * from finish();
rollback;
