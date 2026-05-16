-- Remove legacy flat capability config table (replaced by AI catalog + ai_institution_settings).
-- Run after: supabase_ai_catalog.sql, supabase_ai_institution_settings.sql, supabase_ai_catalog_class_scope.sql

DROP TRIGGER IF EXISTS ai_capability_configs_enforce_locks_trg ON public.ai_capability_configs;
DROP FUNCTION IF EXISTS public.ai_capability_configs_enforce_locks();
DROP VIEW IF EXISTS public.ai_capability_configs_meta;
DROP TABLE IF EXISTS public.ai_capability_configs CASCADE;
