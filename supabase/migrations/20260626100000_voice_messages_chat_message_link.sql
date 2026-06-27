-- Link voice_messages to chat_messages so audio can be joined by FK instead of
-- the fragile positional (role + ordinal) matching the teacher view relied on.
-- Mirrors the chat_message_actions pattern: a satellite row that references
-- chat_messages(id). Nullable + ON DELETE SET NULL so historical rows (written
-- before this column existed) remain valid and audio provenance survives if a
-- chat message is ever removed.

alter table "public"."voice_messages"
    add column if not exists "chat_message_id" "uuid";

alter table only "public"."voice_messages"
    add constraint "voice_messages_chat_message_id_fkey"
    foreign key ("chat_message_id") references "public"."chat_messages"("id") on delete set null;

create index if not exists "voice_messages_chat_message_idx"
    on "public"."voice_messages" using "btree" ("chat_message_id");

comment on column "public"."voice_messages"."chat_message_id" is
    'References chat_messages.id — the transcript turn this audio belongs to. Nullable for rows written before this link existed.';
