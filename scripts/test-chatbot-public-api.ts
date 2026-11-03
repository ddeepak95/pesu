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

// Requires a running local Next.js server configured for local Supabase.
// No model requests are made by this test.
test("public HTTP sessions isolate transcripts and honor public-access revocation", async () => {
  const teacher = randomUUID(), institution = randomUUID(), classId = randomUUID();
  const shortId = `public-test-${randomUUID()}`;
  const origin = "http://localhost:3000";
  const endpoint = `${origin}/api/chatbots/${shortId}`;
  try {
    const setup = await sql(`begin;
      insert into auth.users(id) values('${teacher}');
      insert into public.institutions(id,name) values('${institution}','Public API test');
      insert into public.classes(id,name,class_id,created_by,institution_id) values('${classId}','Public API test','${randomUUID()}','${teacher}','${institution}');
      insert into public.chatbots(chatbot_id,class_id,title,topic_title,language,system_prompt,created_by,status,is_public,max_conversations)
        values('${shortId}','${classId}','Public API test','Test','en','Test','${teacher}','active',true,1);
      commit;`);
    assert.equal(setup.code, 0, setup.error);
    async function request(path: string, cookie = "", body?: unknown) {
      return fetch(`${endpoint}/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    const info = await request("public");
    assert.equal(info.status, 200, "Run the local server with local Supabase enabled");
    assert.match(info.headers.get("cache-control")!, /no-store/);
    assert.equal((await info.json()).participant, null);
    assert.equal((await request("public?view=conversations")).status, 401);
    const crossOrigin = await fetch(`${endpoint}/public`, { method: "POST", headers: { Origin: "https://example.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Rejected" }) });
    assert.equal(crossOrigin.status, 403);
    const enter = await request("public", "", { name: "Visitor One" });
    assert.equal(enter.status, 200, await enter.text());
    const setCookie = enter.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);
    const cookie = setCookie.split(";")[0];
    const entered = await request("public", cookie);
    const sessionText = await entered.text();
    const session = JSON.parse(sessionText);
    assert.equal(session.participant.name, "Visitor One");
    assert.doesNotMatch(sessionText, /token_hash/);
    assert.ok(!sessionText.includes(cookie.split("=")[1]));
    const invalidLanguage = await request("conversation", cookie, { publicMode: true, restart: false, initialLanguage: "unknown" });
    assert.equal(invalidLanguage.status, 400);
    const lockedLanguage = await request("conversation", cookie, { publicMode: true, restart: false, initialLanguage: "fr" });
    assert.equal(lockedLanguage.status, 403);
    assert.deepEqual(await (await request("public?view=conversations", cookie)).json(), [], "Rejected language consumes no conversation");
    assert.equal((await sql(`update public.chatbots set lock_language=false where chatbot_id='${shortId}';`)).code, 0);
    const open = await request("conversation", cookie, { publicMode: true, restart: false, initialLanguage: "fr" });
    const opened = await open.json();
    assert.equal(open.status, 200, JSON.stringify(opened));
    assert.equal(opened.conversation.language, "fr", "Initial language is saved before opening generation");
    const id = opened.conversation.id;
    assert.equal(opened.conversation.public_participant_id, session.participant.id);
    const resume = await request("conversation", cookie, { publicMode: true, restart: false, initialLanguage: "de" });
    const resumed = await resume.json();
    assert.equal(resumed.conversation.id, id);
    assert.equal(resumed.conversation.language, "fr", "Resuming preserves existing language");
    const restart = await request("conversation", cookie, { publicMode: true, restart: true, expectedId: id });
    assert.equal(restart.status, 409);
    assert.match((await restart.json()).error, /Conversation limit/);
    const other = await request("public", "", { name: "Visitor Two" });
    assert.equal(other.status, 200);
    const otherCookie = other.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await request(`public?view=messages&conversationId=${id}`, otherCookie)).status, 404);
    assert.equal((await request("conversation", otherCookie, { publicMode: true, conversationId: id, language: "fr" })).status, 404);
    assert.deepEqual(await (await request("public?view=conversations", otherCookie)).json(), []);
    assert.deepEqual(await (await request(`public?view=messages&conversationId=${id}`, cookie)).json(), []);
    assert.equal((await request("conversation", cookie, { publicMode: true, preview: true, restart: false })).status, 400);
    assert.equal((await request("conversation", cookie, { preview: true, restart: false })).status, 401);
    const logout = await request("public", cookie, { action: "logout" });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/i);
    assert.match(logout.headers.get("set-cookie")!, /Path=\/api\/chatbots\//i);
    assert.equal((await (await request("public", cookie)).json()).participant, null, "Logged-out token is revoked");
    assert.equal((await request(`public?view=messages&conversationId=${id}`, cookie)).status, 401);
    assert.equal((await (await request("public", otherCookie)).json()).participant.name, "Visitor Two", "Other visitor sessions remain valid");
    const retained = await sql(`select count(*) from public.chatbot_conversations where id='${id}';`);
    assert.equal(retained.output.trim(), "1", "Logout preserves conversation history");
    const disable = await sql(`update public.chatbots set is_public=false where chatbot_id='${shortId}';`);
    assert.equal(disable.code, 0, disable.error);
    assert.equal((await request("public", cookie)).status, 404);
    assert.equal((await request(`public?view=messages&conversationId=${id}`, cookie)).status, 404);
    assert.equal((await request("conversation", cookie, { publicMode: true, restart: false })).status, 404);
  } finally {
    const cleanup = await sql(`begin;
      delete from public.chatbots where class_id='${classId}';
      delete from public.class_groups where class_id='${classId}';
      delete from public.classes where id='${classId}';
      delete from public.institutions where id='${institution}';
      delete from auth.users where id='${teacher}';
      commit;`);
    assert.equal(cleanup.code, 0, cleanup.error);
  }
});
