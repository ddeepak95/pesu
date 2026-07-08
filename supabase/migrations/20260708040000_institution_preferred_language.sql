-- Institution-level default language: seeds `preferredLanguage` when an
-- admin creates a class under this institution (client-side pre-fill only —
-- no server-side enforcement, so existing callers of
-- create_class_for_institution that omit the parameter keep defaulting to
-- 'en'). Covered by the institutions table's existing RLS policies: super
-- admins can already read/write every column, institution admins can already
-- read every column.
ALTER TABLE "public"."institutions"
  ADD COLUMN "preferred_language" "text" NOT NULL DEFAULT 'en';
