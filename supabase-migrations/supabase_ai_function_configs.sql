-- SUPERSEDED by supabase_ai_capability_configs.sql — do not run on new environments.
-- Migration: AI function configs (platform / institution / class).
--
-- Per-function provider, model, and encrypted API keys. Institution lock row
-- uses function_key = '__locks__'. Clients read ai_function_configs_meta only.
--
-- Depends on: institutions phase, is_platform_super_admin, is_institution_admin,
-- is_class_institution_admin.

-- =====================================================================
-- 1. Enum + table
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_config_scope') THEN
    CREATE TYPE public.ai_config_scope AS ENUM ('platform', 'institution', 'class');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_function_configs (
  scope                  public.ai_config_scope NOT NULL,
  scope_id               uuid                   NOT NULL,
  function_key           text                   NOT NULL,
  use_platform_default   boolean                NOT NULL DEFAULT false,
  provider               text,
  encrypted_api_key      text,
  model_id               text,
  key_hint               text,
  allow_admin_edit             boolean                NOT NULL DEFAULT true,
  allow_child_override         boolean                NOT NULL DEFAULT true,
  allow_use_platform_defaults  boolean                NOT NULL DEFAULT true,
  updated_by             uuid REFERENCES auth.users(id),
  updated_at             timestamptz            NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, function_key),
  CONSTRAINT ai_function_configs_provider_check
    CHECK (provider IS NULL OR provider = ANY (ARRAY['google'::text, 'openai'::text]))
);

CREATE INDEX IF NOT EXISTS ai_function_configs_scope_idx
  ON public.ai_function_configs (scope, scope_id);

CREATE INDEX IF NOT EXISTS ai_function_configs_function_key_idx
  ON public.ai_function_configs (function_key);

-- Metadata view — never expose ciphertext to clients.
-- security_invoker = true: RLS on ai_function_configs applies to the querying user.
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

ALTER TABLE public.ai_function_configs ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. RLS policies
-- =====================================================================

DROP POLICY IF EXISTS "Super admins manage all ai configs" ON public.ai_function_configs;
CREATE POLICY "Super admins manage all ai configs"
  ON public.ai_function_configs FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS "Institution admins manage ai configs" ON public.ai_function_configs;
CREATE POLICY "Institution admins manage ai configs"
  ON public.ai_function_configs FOR ALL
  USING (
    (scope = 'institution' AND public.is_institution_admin(scope_id))
    OR
    (scope = 'class' AND public.is_class_institution_admin(scope_id))
  )
  WITH CHECK (
    (scope = 'institution' AND public.is_institution_admin(scope_id))
    OR
    (scope = 'class' AND public.is_class_institution_admin(scope_id))
  );

DROP POLICY IF EXISTS "Class owners manage class ai configs" ON public.ai_function_configs;
CREATE POLICY "Class owners manage class ai configs"
  ON public.ai_function_configs FOR ALL
  USING (
    scope = 'class'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = ai_function_configs.scope_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    scope = 'class'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = ai_function_configs.scope_id AND c.created_by = auth.uid()
    )
  );

-- Platform rows: super admin writes; all authenticated users may read metadata
-- (via ai_function_configs_meta) for inheritance display in institution UI.
DROP POLICY IF EXISTS "Authenticated read platform ai configs" ON public.ai_function_configs;
CREATE POLICY "Authenticated read platform ai configs"
  ON public.ai_function_configs FOR SELECT
  USING (scope = 'platform');

-- Writes on platform rows (SELECT is covered by the read policy + super-admin ALL).
DROP POLICY IF EXISTS "Super admins manage platform ai configs" ON public.ai_function_configs;
CREATE POLICY "Super admins manage platform ai configs"
  ON public.ai_function_configs FOR ALL
  USING (scope = 'platform' AND public.is_platform_super_admin())
  WITH CHECK (scope = 'platform' AND public.is_platform_super_admin());

-- Read-only metadata for class teachers / students (readiness banner, inheritance UI).
DROP POLICY IF EXISTS "Class members read institution ai configs" ON public.ai_function_configs;
CREATE POLICY "Class members read institution ai configs"
  ON public.ai_function_configs FOR SELECT
  USING (
    scope = 'institution'
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = ai_function_configs.scope_id
        AND (
          public.is_class_co_teacher(c.id)
          OR public.is_class_student(c.id)
        )
    )
  );

DROP POLICY IF EXISTS "Class members read class ai configs" ON public.ai_function_configs;
CREATE POLICY "Class members read class ai configs"
  ON public.ai_function_configs FOR SELECT
  USING (
    scope = 'class'
    AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_class_student(scope_id)
    )
  );

-- =====================================================================
-- 3. Child-override lock trigger (institution __locks__ row)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_function_configs_enforce_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id   uuid;
  v_allow_override   boolean;
BEGIN
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.scope = 'institution' AND NEW.function_key = '__locks__' THEN
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit on AI config locks';
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

DROP TRIGGER IF EXISTS ai_function_configs_enforce_locks_trg ON public.ai_function_configs;
CREATE TRIGGER ai_function_configs_enforce_locks_trg
  BEFORE INSERT OR UPDATE ON public.ai_function_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_function_configs_enforce_locks();
