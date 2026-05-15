-- SUPERSEDED by supabase_ai_capability_configs.sql — do not run on new environments.
-- Institution policy: super admin may disallow use of platform AI defaults.
-- Also refreshes ai_function_configs_meta and extends the lock trigger.

ALTER TABLE public.ai_function_configs
  ADD COLUMN IF NOT EXISTS allow_use_platform_defaults boolean NOT NULL DEFAULT true;

-- CREATE OR REPLACE cannot insert a column before existing view columns (42P16);
-- drop and recreate so column order matches the app META_COLUMNS list.
DROP VIEW IF EXISTS public.ai_function_configs_meta;

CREATE VIEW public.ai_function_configs_meta
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

CREATE OR REPLACE FUNCTION public.ai_function_configs_enforce_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id              uuid;
  v_allow_override              boolean;
  v_allow_platform_defaults     boolean;
BEGIN
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.scope = 'institution' AND NEW.function_key = '__locks__' THEN
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit on AI config locks';
    END IF;
    IF NEW.allow_use_platform_defaults IS DISTINCT FROM OLD.allow_use_platform_defaults THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_use_platform_defaults on AI config locks';
    END IF;
  END IF;

  IF NEW.scope = 'institution'
     AND NEW.function_key <> '__locks__'
     AND NEW.use_platform_default = true THEN
    SELECT a.allow_use_platform_defaults INTO v_allow_platform_defaults
      FROM public.ai_function_configs a
      WHERE a.scope = 'institution'
        AND a.scope_id = NEW.scope_id
        AND a.function_key = '__locks__';

    IF v_allow_platform_defaults IS NOT NULL AND v_allow_platform_defaults = false THEN
      RAISE EXCEPTION 'Institution may not use platform AI defaults for this institution';
    END IF;
  END IF;

  IF NEW.scope = 'class' AND NEW.function_key <> '__locks__' AND NEW.use_platform_default = false THEN
    SELECT c.institution_id INTO v_institution_id
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_institution_id IS NOT NULL THEN
      SELECT a.allow_child_override INTO v_allow_override
        FROM public.ai_function_configs a
        WHERE a.scope = 'institution'
          AND a.scope_id = v_institution_id
          AND a.function_key = '__locks__';

      IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
        RAISE EXCEPTION 'Class AI override is disabled by the institution';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
