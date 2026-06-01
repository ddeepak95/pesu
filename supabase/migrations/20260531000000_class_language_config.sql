-- Class-level language defaults.
-- Adds a flexible jsonb column holding the class's default primary/support
-- language settings and per-language locks. These SEED new assignments (teachers
-- can still override per assignment); locks bind students at runtime through the
-- assignment's existing lock_language / multimodal_actions.languageSupport.locked.
--
-- Shape (all keys optional; null/missing => prior behavior):
--   {
--     "lockPrimaryLanguage":   boolean,  -- lock the primary language for students
--     "supportLanguageEnabled":boolean,  -- pre-enable language support on new assignments
--     "defaultSupportLanguage":text,     -- default support language (locale code)
--     "lockSupportLanguage":   boolean   -- lock the support language for students
--   }

alter table "public"."classes"
    add column if not exists "language_config" "jsonb";
