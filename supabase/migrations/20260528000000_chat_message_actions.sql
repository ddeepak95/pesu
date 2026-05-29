-- Multimodal action persistence (Phase 1: MCQ).
-- Stores rich pedagogical actions attached to an assistant chat message so the
-- session can be replayed. `payload` is the system-generated content (written
-- once); `response` is the learner's interaction (nullable, written later) and
-- is generic across action kinds, e.g. MCQ -> { "answeredIndex": 2 }.

create table if not exists "public"."chat_message_actions" (
    "id" "uuid" default "gen_random_uuid"() not null,
    "chat_message_id" "uuid" not null,
    "submission_id" "text",
    "kind" "text" not null,
    "payload" "jsonb" not null,
    "response" "jsonb",
    "created_at" timestamp with time zone default "now"() not null
);

alter table "public"."chat_message_actions" owner to "postgres";

alter table only "public"."chat_message_actions"
    add constraint "chat_message_actions_pkey" primary key ("id");

alter table only "public"."chat_message_actions"
    add constraint "chat_message_actions_chat_message_id_fkey"
    foreign key ("chat_message_id") references "public"."chat_messages"("id") on delete cascade;

create index "chat_message_actions_chat_message_idx"
    on "public"."chat_message_actions" using "btree" ("chat_message_id");

create index "chat_message_actions_submission_idx"
    on "public"."chat_message_actions" using "btree" ("submission_id", "created_at");

-- RLS mirrors chat_messages: public/anon may create and read.
alter table "public"."chat_message_actions" enable row level security;

create policy "Allow public to create chat message actions"
    on "public"."chat_message_actions" for insert
    to "authenticated", "anon" with check (true);

create policy "Allow public to read chat message actions"
    on "public"."chat_message_actions" for select
    to "authenticated", "anon" using (true);

create policy "Allow public to update chat message actions"
    on "public"."chat_message_actions" for update
    to "authenticated", "anon" using (true) with check (true);

grant all on table "public"."chat_message_actions" to "anon";
grant all on table "public"."chat_message_actions" to "authenticated";
grant all on table "public"."chat_message_actions" to "service_role";
