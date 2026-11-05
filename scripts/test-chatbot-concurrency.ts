import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Explicitly local: never loads application/cloud database credentials.
const container = "supabase_db_concept-asr";
function sql(query: string): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]);
    let output = "", error = "";
    process.stdout.on("data", chunk => output += chunk);
    process.stderr.on("data", chunk => error += chunk);
    process.on("error", reject);
    process.on("close", code => resolve({ code: code ?? 1, output, error }));
    process.stdin.end(query);
  });
}

test("concurrent requests admit exactly one turn and one restart", async () => {
  const teacher = randomUUID(), student = randomUUID(), institution = randomUUID(), classId = randomUUID();
  let bot = "";
  try {
    const setup = await sql(`
      begin;
      insert into auth.users(id) values('${teacher}'),('${student}');
      insert into public.institutions(id,name) values('${institution}','Chatbot concurrency test');
      insert into public.classes(id,name,class_id,created_by,institution_id) values('${classId}','Chatbot concurrency test','${randomUUID()}','${teacher}','${institution}');
      insert into public.class_students(class_id,student_id) values('${classId}','${student}');
      insert into public.setting_values(scope,scope_id,key,value) values('institution','${institution}','allowed_content_types','["chatbot"]');
      select set_config('request.jwt.claim.sub','${teacher}',true);
      select (public.save_chatbot('${classId}',(select id from public.class_groups where class_id='${classId}' limit 1),
        '{"title":"Test","topic_title":"Physics","language":"en","system_prompt":"Teach physics","turn_limit":1,"max_conversations":2,"web_search":false,"image_search":false,"status":"active"}')).id;
      commit;
    `);
    assert.equal(setup.code, 0, setup.error);
    bot = setup.output.split(/\r?\n/).filter(line => /^[0-9a-f-]{36}$/i.test(line)).at(-1)!;
    assert.ok(bot);
    const opened = await sql(`select (public.open_chatbot_conversation('${bot}','${student}',false)).id;`);
    assert.equal(opened.code, 0, opened.error);
    const conversation = opened.output.trim();
    const greeting = randomUUID();
    const greeted = await sql(`select public.reserve_chatbot_turn('${conversation}','${student}','${greeting}',null); select public.finish_chatbot_turn('${conversation}','${greeting}','Welcome');`);
    assert.equal(greeted.code, 0, greeted.error);

    const messageIds = [randomUUID(), randomUUID()];
    const turns = await Promise.all(messageIds.map(message => sql(`begin; select public.reserve_chatbot_turn('${conversation}','${student}','${message}','Explain physics'); select pg_sleep(0.2); commit;`)));
    assert.equal(turns.filter(result => result.code === 0).length, 1, JSON.stringify(turns));
    assert.match(turns.find(result => result.code !== 0)!.error, /reply is already in progress/);
    const winningMessage = messageIds[turns.findIndex(result => result.code === 0)];
    assert.equal((await sql(`select public.finish_chatbot_turn('${conversation}','${winningMessage}',null);`)).code, 0);

    const restarts = await Promise.all([1, 2].map(() => sql(`begin; select public.open_chatbot_conversation('${bot}','${student}',true,'${conversation}'); select pg_sleep(0.2); commit;`)));
    assert.equal(restarts.filter(result => result.code === 0).length, 1, JSON.stringify(restarts));
    assert.match(restarts.find(result => result.code !== 0)!.error, /Conversation changed/);
    const count = await sql(`select count(*) from public.chatbot_conversations where chatbot_id='${bot}';`);
    assert.equal(count.output.trim(), "2", "Only one restart consumed");

    const preview = await sql(`select (public.open_chatbot_preview('${bot}','${teacher}',false)).id;`);
    assert.equal(preview.code, 0, preview.error);
    const previewId = preview.output.trim();
    const previewRestarts = await Promise.all([1, 2].map(() => sql(`begin; select public.open_chatbot_preview('${bot}','${teacher}',true,'${previewId}'); select pg_sleep(0.2); commit;`)));
    assert.equal(previewRestarts.filter(result => result.code === 0).length, 1, JSON.stringify(previewRestarts));
    assert.match(previewRestarts.find(result => result.code !== 0)!.error, /Conversation changed/);
    const guest = randomUUID();
    const publicSetup = await sql(`update public.chatbots set is_public=true where id='${bot}'; insert into public.chatbot_public_participants(id,chatbot_id,name,token_hash) values('${guest}','${bot}','Public visitor','${randomUUID()}'); select (public.open_chatbot_conversation('${bot}','${guest}',false)).id;`);
    assert.equal(publicSetup.code, 0, publicSetup.error);
    const publicId = publicSetup.output.trim().split(/\r?\n/).at(-1)!;
    const publicRestarts = await Promise.all([1, 2].map(() => sql(`begin; select public.open_chatbot_conversation('${bot}','${guest}',true,'${publicId}'); select pg_sleep(0.2); commit;`)));
    assert.equal(publicRestarts.filter(result => result.code === 0).length, 1, JSON.stringify(publicRestarts));
    assert.match(publicRestarts.find(result => result.code !== 0)!.error, /Conversation changed/);
    const publicCount = await sql(`select count(*) from public.chatbot_conversations where chatbot_id='${bot}' and public_participant_id='${guest}';`);
    assert.equal(publicCount.output.trim(), "2", "Concurrent public restarts consume exactly one allowance");
    const studentCount = await sql(`select count(*) from public.chatbot_conversations where chatbot_id='${bot}' and student_id='${student}';`);
    assert.equal(studentCount.output.trim(), "2", "Preview restarts leave student allowance unchanged");
    const imageSetup = await sql(`begin; insert into public.institution_members(institution_id,user_id) values('${institution}','${teacher}');
      select set_config('request.jwt.claim.sub','${teacher}',true);
      insert into public.setting_values(scope,scope_id,key,value) values('class','${classId}','allow_chatbot_images','true');
      insert into public.chatbot_images(chatbot_id,description,filename,storage_path,mime_type,file_size,status)
        select '${bot}','Diagram','image.png','assets/test','image/png',100,'ready' from generate_series(1,19); commit;`);
    assert.equal(imageSetup.code, 0, imageSetup.error);
    const uploads = await Promise.all([1, 2].map(() => sql(`begin; select public.manage_chatbot_image('${bot}','${teacher}','request',
      jsonb_build_object('id','${randomUUID()}','description','Diagram','filename','image.png','storage_path','staging/test','mime_type','image/png','file_size',100));
      select pg_sleep(0.2); commit;`)));
    assert.equal(uploads.filter(result => result.code === 0).length, 1, JSON.stringify(uploads));
    assert.match(uploads.find(result => result.code !== 0)!.error, /Maximum 20 images/);
    const imageCount = await sql(`select count(*) from public.chatbot_images where chatbot_id='${bot}';`);
    assert.equal(imageCount.output.trim(), "20", "Concurrent uploads obey the library limit");
  } finally {
    const cleanup = await sql(`begin;
      delete from public.content_items where class_id='${classId}';
      delete from public.chatbots where class_id='${classId}';
      delete from public.class_group_memberships where class_id='${classId}';
      delete from public.class_students where class_id='${classId}';
      delete from public.class_groups where class_id='${classId}';
      delete from public.classes where id='${classId}';
      delete from public.setting_values where scope_id='${institution}';
      delete from public.institutions where id='${institution}';
      delete from auth.users where id in ('${teacher}','${student}');
      commit;`);
    assert.equal(cleanup.code, 0, cleanup.error);
  }
});
