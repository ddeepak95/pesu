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
reset role;
select set_config('test.guest', gen_random_uuid()::text, true);
select set_config('test.guest2', gen_random_uuid()::text, true);
insert into public.chatbot_public_participants(id,chatbot_id,name,token_hash) values
 (current_setting('test.guest')::uuid,current_setting('test.bot')::uuid,'Visitor','private-token-hash'),
 (current_setting('test.guest2')::uuid,current_setting('test.bot')::uuid,'Other visitor','other-private-hash');
select ok(not (select is_public from public.chatbots where id=current_setting('test.bot')::uuid), 'Public access is off by default');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)$$, '42501', 'Chatbot unavailable', 'Private bots reject guests');
set local role authenticated;
select ok((public.save_chatbot(current_setting('test.class')::uuid,null,current_setting('test.config')::jsonb || '{"is_public":true}',current_setting('test.bot')::uuid)).is_public, 'Teacher can publish public chatbot');
select is((select name from public.chatbot_public_participants where id=current_setting('test.guest')::uuid), 'Visitor', 'Teacher can read respondent names');
select throws_ok($$select token_hash from public.chatbot_public_participants$$, '42501', 'permission denied for table chatbot_public_participants', 'Teacher cannot read guest credentials');
reset role;
select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)).id::text, true);
select ok((select student_id is null and preview_owner_id is null and not is_preview and public_participant_id=current_setting('test.guest')::uuid from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 'Public conversation has a separate guest owner');
select is((public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)).id::text, current_setting('test.conversation'), 'Guest resumes the same ID');
select pg_temp.greet(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid);
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 0, 'Public opening uses no student turn');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.guest2')::uuid,gen_random_uuid(),'Read another session')$$, '42501', 'Chatbot unavailable', 'Guests cannot send to another guest conversation');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,true,current_setting('test.conversation')::uuid)$$, 'P0001', 'Conversation limit reached', 'Guest conversation cap enforced');
select set_config('test.message',gen_random_uuid()::text,true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,current_setting('test.message')::uuid,'Hello');
select public.finish_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,null);
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 0, 'Failed public reply consumes no turn');
select set_config('test.message',gen_random_uuid()::text,true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,current_setting('test.message')::uuid,'Hello again');
select public.finish_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,'Hello visitor');
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,gen_random_uuid(),'Over cap')$$, 'P0001', 'Turn limit reached', 'Public turn cap enforced');
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,'fr')$$, '42501', 'Conversation language is locked by your teacher', 'Language lock applies to guests');
update public.chatbots set lock_language=false where id=current_setting('test.bot')::uuid;
select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,'fr');
select is((select language from public.chatbot_conversations where id=current_setting('test.conversation')::uuid), 'fr', 'Guest language preference persists');
select set_config('request.jwt.claim.sub',current_setting('test.student'),true);
set local role authenticated;
select is((select count(id)::integer from public.chatbot_public_participants), 0, 'Students cannot list guest identities');
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 0, 'Students cannot read guest transcript');
select set_config('request.jwt.claim.sub',current_setting('test.teacher'),true);
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 4, 'Teacher can review public transcript');
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
select is((select count(*)::integer from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid), 4, 'Institution administrator can review public transcript');
reset role;
set local role anon;
select throws_ok($$select id from public.chatbot_public_participants$$,'42501','permission denied for table chatbot_public_participants','Anonymous clients cannot enumerate guests');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)$$,'42501','permission denied for function open_chatbot_conversation','Guests cannot bypass server credential checks');
select throws_ok($$select id from public.chatbot_messages$$,'42501','permission denied for table chatbot_messages','Anonymous clients cannot read messages directly');
reset role;
update public.chatbots set max_conversations=2 where id=current_setting('test.bot')::uuid;
select set_config('test.old',current_setting('test.conversation'),true);
select set_config('test.conversation',(public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,true,current_setting('test.old')::uuid)).id::text,true);
select ok(current_setting('test.old') <> current_setting('test.conversation'),'Public restart gets a new UUID');
select ok((select closed_at is not null from public.chatbot_conversations where id=current_setting('test.old')::uuid),'Public restart preserves and closes prior conversation');
update public.chatbots set max_conversations=1 where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,true,current_setting('test.conversation')::uuid)$$,'P0001','Conversation limit reached','Lowered allowance applies to guests');
update public.chatbots set max_conversations=null where id=current_setting('test.bot')::uuid;
select is((public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,true,current_setting('test.conversation')::uuid)).sequence,3,'Unlimited guest allowance permits additional conversation');
select set_config('test.conversation',(public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)).id::text,true);
update public.chatbots set is_public=false where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,gen_random_uuid(),null)$$,'42501','Chatbot unavailable','Disabling public access blocks existing guest replies');
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)$$,'42501','Chatbot unavailable','Disabling public access blocks resuming');
select throws_ok($$select public.set_chatbot_conversation_language(current_setting('test.conversation')::uuid,current_setting('test.guest')::uuid,'fr')$$,'42501','Conversation unavailable','Disabled public bots reject language changes');
update public.chatbots set is_public=true,status='draft' where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)$$,'42501','Chatbot unavailable','Public drafts are inaccessible');
update public.chatbots set status='active' where id=current_setting('test.bot')::uuid;
-- Initial-language admission is atomic for public, classroom, and preview owners.
select is((public.open_chatbot_with_language(current_setting('test.bot')::uuid,current_setting('test.guest2')::uuid,false,false,null,'fr')).language,'fr','Public initial language is stored atomically');
select is((public.open_chatbot_with_language(current_setting('test.bot')::uuid,current_setting('test.guest2')::uuid,false,false,null,'de')).language,'fr','Resuming does not overwrite language');
update public.chatbots set lock_language=true where id=current_setting('test.bot')::uuid;
select throws_ok($$select public.open_chatbot_with_language(current_setting('test.bot')::uuid,current_setting('test.other')::uuid,false,false,null,'fr')$$,'42501','Conversation language is locked by your teacher','Initial language honors teacher locks');
select is((select count(*)::integer from public.chatbot_conversations where student_id=current_setting('test.other')::uuid),0,'Rejected initial language rolls back conversation creation');
update public.chatbots set lock_language=false where id=current_setting('test.bot')::uuid;
select is((public.open_chatbot_with_language(current_setting('test.bot')::uuid,current_setting('test.other')::uuid,false,false,null,'ta')).language,'ta','Classroom initial language persists');
select is((public.open_chatbot_with_language(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,true,false,null,'fr')).language,'fr','Teacher preview supports initial language');
update public.classes set status='deleted' where id=current_setting('test.class')::uuid;
select throws_ok($$select public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.guest')::uuid,false)$$,'42501','Chatbot unavailable','Inactive classes reject public access');
select * from finish();
rollback;
