-- Migration: AI catalog (provider activations + function bindings).
--
-- Platform / institution scoped catalog for multi-provider, per-function model bindings.
-- Depends on: ai_config_scope enum, is_platform_super_admin, is_institution_admin,
-- is_class_co_teacher, is_class_student (read paths for resolve).

-- =====================================================================
-- 1. Tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ai_provider_activations (
  scope                 public.ai_config_scope NOT NULL,
  scope_id              uuid                   NOT NULL,
  provider_id           text                   NOT NULL,
  use_platform_default  boolean                NOT NULL DEFAULT false,
  is_active             boolean                NOT NULL DEFAULT false,
  encrypted_api_key     text,
  key_hint              text,
  updated_by            uuid REFERENCES auth.users(id),
  updated_at            timestamptz            NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, provider_id),
  CONSTRAINT ai_provider_activations_provider_check
    CHECK (provider_id = ANY (ARRAY['google'::text, 'openai'::text])),
  CONSTRAINT ai_provider_activations_scope_check
    CHECK (scope = ANY (ARRAY['platform'::public.ai_config_scope, 'institution'::public.ai_config_scope]))
);

CREATE INDEX IF NOT EXISTS ai_provider_activations_scope_idx
  ON public.ai_provider_activations (scope, scope_id);

CREATE TABLE IF NOT EXISTS public.ai_function_bindings (
  scope         public.ai_config_scope NOT NULL,
  scope_id      uuid                   NOT NULL,
  binding_key   text                   NOT NULL,
  provider_id   text                   NOT NULL,
  model_id      text                   NOT NULL,
  reasoning_json jsonb,
  updated_by    uuid REFERENCES auth.users(id),
  updated_at    timestamptz            NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, binding_key),
  CONSTRAINT ai_function_bindings_provider_check
    CHECK (provider_id = ANY (ARRAY['google'::text, 'openai'::text])),
  CONSTRAINT ai_function_bindings_scope_check
    CHECK (scope = ANY (ARRAY['platform'::public.ai_config_scope, 'institution'::public.ai_config_scope]))
);

CREATE INDEX IF NOT EXISTS ai_function_bindings_scope_idx
  ON public.ai_function_bindings (scope, scope_id);

-- =====================================================================
-- 2. RLS
-- =====================================================================

ALTER TABLE public.ai_provider_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_function_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage all ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Super admins manage all ai provider activations"
  ON public.ai_provider_activations FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS "Institution admins manage ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Institution admins manage ai provider activations"
  ON public.ai_provider_activations FOR ALL
  USING (scope = 'institution' AND public.is_institution_admin(scope_id))
  WITH CHECK (scope = 'institution' AND public.is_institution_admin(scope_id));

DROP POLICY IF EXISTS "Authenticated read platform ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Authenticated read platform ai provider activations"
  ON public.ai_provider_activations FOR SELECT
  USING (scope = 'platform');

DROP POLICY IF EXISTS "Super admins manage platform ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Super admins manage platform ai provider activations"
  ON public.ai_provider_activations FOR ALL
  USING (scope = 'platform' AND public.is_platform_super_admin())
  WITH CHECK (scope = 'platform' AND public.is_platform_super_admin());

DROP POLICY IF EXISTS "Class members read institution ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Class members read institution ai provider activations"
  ON public.ai_provider_activations FOR SELECT
  USING (
    scope = 'institution'
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = ai_provider_activations.scope_id
        AND (
          public.is_class_co_teacher(c.id)
          OR public.is_class_student(c.id)
        )
    )
  );

DROP POLICY IF EXISTS "Super admins manage all ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Super admins manage all ai function bindings"
  ON public.ai_function_bindings FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS "Institution admins manage ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Institution admins manage ai function bindings"
  ON public.ai_function_bindings FOR ALL
  USING (scope = 'institution' AND public.is_institution_admin(scope_id))
  WITH CHECK (scope = 'institution' AND public.is_institution_admin(scope_id));

DROP POLICY IF EXISTS "Authenticated read platform ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Authenticated read platform ai function bindings"
  ON public.ai_function_bindings FOR SELECT
  USING (scope = 'platform');

DROP POLICY IF EXISTS "Super admins manage platform ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Super admins manage platform ai function bindings"
  ON public.ai_function_bindings FOR ALL
  USING (scope = 'platform' AND public.is_platform_super_admin())
  WITH CHECK (scope = 'platform' AND public.is_platform_super_admin());

DROP POLICY IF EXISTS "Class members read institution ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Class members read institution ai function bindings"
  ON public.ai_function_bindings FOR SELECT
  USING (
    scope = 'institution'
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = ai_function_bindings.scope_id
        AND (
          public.is_class_co_teacher(c.id)
          OR public.is_class_student(c.id)
        )
    )
  );
