-- SUPERSEDED by supabase_ai_capability_configs.sql — do not run on new environments.
-- Patch: ensure ai_function_configs_meta respects base-table RLS (Postgres 15+).
-- Safe to run if the view already exists from supabase_ai_function_configs.sql.

CREATE OR REPLACE VIEW public.ai_function_configs_meta
WITH (security_invoker = true)
AS
SELECT
  scope,
  scope_id,
  function_key,
  use_platform_default,
  provider,
  model_id,
  key_hint,
  allow_admin_edit,
  allow_child_override,
  allow_use_platform_defaults,
  updated_by,
  updated_at
FROM public.ai_function_configs;

GRANT SELECT ON public.ai_function_configs_meta TO authenticated;
