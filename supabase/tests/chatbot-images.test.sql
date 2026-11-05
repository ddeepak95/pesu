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


insert into public.setting_values(scope,scope_id,key,value,allow_admin_edit,allow_child_override)
values('institution',current_setting('test.institution')::uuid,'allowed_content_types','["chatbot"]',true,true);
select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select set_config('test.bot', (public.save_chatbot(current_setting('test.class')::uuid,current_setting('test.group')::uuid,current_setting('test.config')::jsonb)).id::text, true);
select throws_ok($$insert into public.setting_values(scope,scope_id,key,value) values('class',current_setting('test.class')::uuid,'allow_chatbot_images','true')$$, '42501', 'Administrator access required', 'Class teacher cannot enable uploaded images directly');
reset role;
select ok(not public.chatbot_images_allowed(current_setting('test.class')::uuid), 'Images disabled by default');
select set_config('test.image', gen_random_uuid()::text, true);
select set_config('test.upload', jsonb_build_object('id', current_setting('test.image'), 'description','A neuron','filename','neuron.png','mime_type','image/png','file_size',100,'storage_path','staging/test')::text, true);
select throws_ok($$select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,'request',current_setting('test.upload')::jsonb)$$,'42501','Image library unavailable','Server refuses disabled uploads');
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
set local role authenticated;
select lives_ok($$insert into public.setting_values(scope,scope_id,key,value) values('class',current_setting('test.class')::uuid,'allow_chatbot_images','true')$$,'Institution admin enables class images');
reset role;
select ok(public.chatbot_images_allowed(current_setting('test.class')::uuid), 'Class permission enabled');
select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,'request',current_setting('test.upload')::jsonb);
select throws_ok($$select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,'edit',current_setting('test.upload')::jsonb)$$,'42501','Image library unavailable','Student cannot modify library');
select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,'confirm',jsonb_build_object('id',current_setting('test.image'),'storage_path','assets/test','file_size',90));
select is((select status from public.chatbot_images where id=current_setting('test.image')::uuid),'ready','Confirmed images selectable');
select set_config('request.jwt.claim.sub', current_setting('test.teacher'), true);
set local role authenticated;
select throws_ok($$select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,'request',current_setting('test.upload')::jsonb)$$, '42501','permission denied for function manage_chatbot_image','Authenticated clients cannot bypass server file checks');
select throws_ok($$select * from public.chatbot_images$$,'42501','permission denied for table chatbot_images','Private storage paths are not exposed');
select throws_ok($$update public.setting_values set value='false' where scope='class' and scope_id=current_setting('test.class')::uuid and key='allow_chatbot_images'$$,'42501','Administrator access required','Teacher cannot disable feature');
select throws_ok($$delete from public.setting_values where scope='class' and scope_id=current_setting('test.class')::uuid and key='allow_chatbot_images'$$,'42501','Administrator access required','Teacher cannot clear admin setting');
select set_config('test.config', (current_setting('test.config')::jsonb || '{"image_mode":"replace","turn_limit":20}')::text, true);
select public.save_chatbot(current_setting('test.class')::uuid,null,current_setting('test.config')::jsonb,current_setting('test.bot')::uuid);
select set_config('test.copy', (public.save_chatbot(current_setting('test.class')::uuid,current_setting('test.group')::uuid,current_setting('test.config')::jsonb,null,jsonb_build_object('image_source_id',current_setting('test.bot')))).id::text, true);
reset role;
select is((select count(*)::integer from public.chatbot_images where chatbot_id=current_setting('test.copy')::uuid),1,'Duplicate copies library');
select isnt((select id from public.chatbot_images where chatbot_id=current_setting('test.copy')::uuid),current_setting('test.image')::uuid,'Duplicate has independent image IDs');
select set_config('test.conversation', (public.open_chatbot_conversation(current_setting('test.bot')::uuid,current_setting('test.student')::uuid,false)).id::text, true);
select set_config('test.message', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,current_setting('test.message')::uuid,null);
select set_config('test.mappings',jsonb_build_array(jsonb_build_object('occurrence_id','image_0','original_url','https://example.org/original.png','image_id',current_setting('test.image'),'action','replace','description','A neuron'))::text,true);
select public.finish_chatbot_turn_images(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,'![Original](https://example.org/original.png)','[]',null,null,current_setting('test.mappings')::jsonb,null);
select is((select content from public.chatbot_messages where id=current_setting('test.message')::uuid),'![Original](https://example.org/original.png)','Original response preserved');
select is((select image_mappings from public.chatbot_messages where id=current_setting('test.message')::uuid),current_setting('test.mappings')::jsonb,'Opening mappings saved atomically');
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid),0,'Opening image matching consumes no student turn');
select set_config('test.message', gen_random_uuid()::text, true);
select public.reserve_chatbot_turn(current_setting('test.conversation')::uuid,current_setting('test.student')::uuid,current_setting('test.message')::uuid,'Explain');
select throws_ok($$select public.finish_chatbot_turn_images(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,'Reply','[]',null,null,jsonb_build_array(jsonb_build_object('occurrence_id','image_0','original_url','https://example.org/original.png','action','replace','image_id',(select id from public.chatbot_images where chatbot_id=current_setting('test.copy')::uuid))),null)$$,'P0001','Invalid image mapping','Cross-chatbot mappings rejected');
select is((select status from public.chatbot_messages where id=current_setting('test.message')::uuid),'pending','Invalid completion rolls back');
select public.finish_chatbot_turn_images(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid,'Second reply','[]',null,null,current_setting('test.mappings')::jsonb,null);
select is((select image_mappings from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid and content='Second reply'),current_setting('test.mappings')::jsonb,'Mapping attached to newly inserted reply despite identical timestamps');
select is((select turns_used from public.chatbot_conversations where id=current_setting('test.conversation')::uuid),1,'One successful user turn counted');
select public.manage_chatbot_image(current_setting('test.bot')::uuid,current_setting('test.teacher')::uuid,'remove',jsonb_build_object('id',current_setting('test.image')));
select is((select status from public.chatbot_images where id=current_setting('test.image')::uuid),'removed','Removal retains historical asset');
select is((select status from public.chatbot_images where chatbot_id=current_setting('test.copy')::uuid),'ready','Removing original leaves duplicated image active');
select set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
set local role authenticated;
update public.setting_values set value='false' where scope='class' and scope_id=current_setting('test.class')::uuid and key='allow_chatbot_images';
reset role;
select ok(not public.chatbot_images_allowed(current_setting('test.class')::uuid),'Admin disables new use');
select is((select image_mappings from public.chatbot_messages where conversation_id=current_setting('test.conversation')::uuid and content='Second reply'),current_setting('test.mappings')::jsonb,'Disabling preserves historical mappings');
select * from finish();
rollback;
