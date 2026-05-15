-- Migration: AI capability configs (platform / institution / class).
--
-- Single text capability per scope (+ institution __locks__ row).
-- Supersedes: supabase_ai_function_configs.sql and related AI patch migrations.
--
-- Depends on: institutions phase, is_platform_super_admin, is_institution_admin,
-- is_class_institution_admin, is_class_co_teacher, is_class_student, can_configure_class.

-- =====================================================================
-- 0. Drop legacy objects
-- =====================================================================

-- DROP TRIGGER requires the table to exist; CASCADE on DROP TABLE removes triggers.
DROP VIEW IF EXISTS public.ai_function_configs_meta;
DROP TABLE IF EXISTS public.ai_function_configs CASCADE;
DROP FUNCTION IF EXISTS public.ai_function_configs_enforce_locks();

DROP VIEW IF EXISTS public.ai_capability_configs_meta;
DROP TABLE IF EXISTS public.ai_capability_configs CASCADE;
DROP FUNCTION IF EXISTS public.ai_capability_configs_enforce_locks();

-- =====================================================================
-- 1. Enum + table
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_config_scope') THEN
    CREATE TYPE public.ai_config_scope AS ENUM ('platform', 'institution', 'class');
  END IF;
END $$;

CREATE TABLE public.ai_capability_configs (
  scope                         public.ai_config_scope NOT NULL,
  scope_id                      uuid                   NOT NULL,
  capability_key                text                   NOT NULL,
  use_platform_default          boolean                NOT NULL DEFAULT false,
  provider                      text,
  encrypted_api_key             text,
  model_id                      text,
  key_hint                      text,
  allow_admin_edit              boolean                NOT NULL DEFAULT false,
  allow_child_override          boolean                NOT NULL DEFAULT false,
  allow_use_platform_defaults   boolean                NOT NULL DEFAULT true,
  updated_by                    uuid REFERENCES auth.users(id),
  updated_at                    timestamptz            NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, capability_key),
  CONSTRAINT ai_capability_configs_capability_key_check
    CHECK (capability_key = ANY (ARRAY['text'::text, '__locks__'::text])),
  CONSTRAINT ai_capability_configs_provider_check
    CHECK (provider IS NULL OR provider = ANY (ARRAY['google'::text, 'openai'::text]))
);

CREATE INDEX ai_capability_configs_scope_idx
  ON public.ai_capability_configs (scope, scope_id);

CREATE INDEX ai_capability_configs_capability_key_idx
  ON public.ai_capability_configs (capability_key);

DROP VIEW IF EXISTS public.ai_capability_configs_meta;

CREATE VIEW public.ai_capability_configs_meta
WITH (security_invoker = true)
AS
SELECT
  scope,
  scope_id,
  capability_key,
  use_platform_default,
  provider,
  model_id,
  key_hint,
  allow_admin_edit,
  allow_child_override,
  allow_use_platform_defaults,
  updated_by,
  updated_at
FROM public.ai_capability_configs;

GRANT SELECT ON public.ai_capability_configs_meta TO authenticated;

ALTER TABLE public.ai_capability_configs ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. RLS policies
-- =====================================================================

DROP POLICY IF EXISTS "Super admins manage all ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Super admins manage all ai capability configs"
  ON public.ai_capability_configs FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS "Institution admins manage ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Institution admins manage ai capability configs"
  ON public.ai_capability_configs FOR ALL
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

DROP POLICY IF EXISTS "Class configurers manage class ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Class configurers manage class ai capability configs"
  ON public.ai_capability_configs FOR ALL
  USING (
    scope = 'class'
    AND public.can_configure_class(scope_id)
  )
  WITH CHECK (
    scope = 'class'
    AND public.can_configure_class(scope_id)
  );

DROP POLICY IF EXISTS "Authenticated read platform ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Authenticated read platform ai capability configs"
  ON public.ai_capability_configs FOR SELECT
  USING (scope = 'platform');

DROP POLICY IF EXISTS "Super admins manage platform ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Super admins manage platform ai capability configs"
  ON public.ai_capability_configs FOR ALL
  USING (scope = 'platform' AND public.is_platform_super_admin())
  WITH CHECK (scope = 'platform' AND public.is_platform_super_admin());

DROP POLICY IF EXISTS "Class members read institution ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Class members read institution ai capability configs"
  ON public.ai_capability_configs FOR SELECT
  USING (
    scope = 'institution'
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = ai_capability_configs.scope_id
        AND (
          public.is_class_co_teacher(c.id)
          OR public.is_class_student(c.id)
        )
    )
  );

DROP POLICY IF EXISTS "Class members read class ai capability configs" ON public.ai_capability_configs;
CREATE POLICY "Class members read class ai capability configs"
  ON public.ai_capability_configs FOR SELECT
  USING (
    scope = 'class'
    AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_class_student(scope_id)
    )
  );

-- =====================================================================
-- 3. Lock-enforcement trigger
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_capability_configs_enforce_locks()
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

  IF TG_OP = 'UPDATE' AND NEW.scope = 'institution' AND NEW.capability_key = '__locks__' THEN
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit on AI config locks';
    END IF;
    IF NEW.allow_use_platform_defaults IS DISTINCT FROM OLD.allow_use_platform_defaults THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_use_platform_defaults on AI config locks';
    END IF;
  END IF;

  IF NEW.scope = 'institution'
     AND NEW.capability_key <> '__locks__'
     AND NEW.use_platform_default = true THEN
    SELECT a.allow_use_platform_defaults INTO v_allow_platform_defaults
      FROM public.ai_capability_configs a
      WHERE a.scope = 'institution'
        AND a.scope_id = NEW.scope_id
        AND a.capability_key = '__locks__';

    IF v_allow_platform_defaults IS NOT NULL AND v_allow_platform_defaults = false THEN
      RAISE EXCEPTION 'Institution may not use platform AI defaults for this institution';
    END IF;
  END IF;

  IF NEW.scope = 'class'
     AND NEW.capability_key <> '__locks__'
     AND NEW.use_platform_default = false THEN
    SELECT c.institution_id INTO v_institution_id
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_institution_id IS NOT NULL THEN
      SELECT a.allow_child_override INTO v_allow_override
        FROM public.ai_capability_configs a
        WHERE a.scope = 'institution'
          AND a.scope_id = v_institution_id
          AND a.capability_key = '__locks__';

      IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
        RAISE EXCEPTION 'Class AI override is disabled by the institution';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_capability_configs_enforce_locks_trg
  BEFORE INSERT OR UPDATE ON public.ai_capability_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_capability_configs_enforce_locks();
