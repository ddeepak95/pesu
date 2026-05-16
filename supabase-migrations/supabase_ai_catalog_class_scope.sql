-- Extend AI catalog to class scope + enforce institution policy on catalog writes.

ALTER TABLE public.ai_provider_activations
  DROP CONSTRAINT IF EXISTS ai_provider_activations_scope_check;

ALTER TABLE public.ai_provider_activations
  ADD CONSTRAINT ai_provider_activations_scope_check
  CHECK (scope = ANY (ARRAY[
    'platform'::public.ai_config_scope,
    'institution'::public.ai_config_scope,
    'class'::public.ai_config_scope
  ]));

ALTER TABLE public.ai_function_bindings
  DROP CONSTRAINT IF EXISTS ai_function_bindings_scope_check;

ALTER TABLE public.ai_function_bindings
  ADD CONSTRAINT ai_function_bindings_scope_check
  CHECK (scope = ANY (ARRAY[
    'platform'::public.ai_config_scope,
    'institution'::public.ai_config_scope,
    'class'::public.ai_config_scope
  ]));

-- Class co-teachers manage class-scoped catalog rows
DROP POLICY IF EXISTS "Class co-teachers manage class ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Class co-teachers manage class ai provider activations"
  ON public.ai_provider_activations FOR ALL
  USING (scope = 'class' AND public.is_class_co_teacher(scope_id))
  WITH CHECK (scope = 'class' AND public.is_class_co_teacher(scope_id));

DROP POLICY IF EXISTS "Class members read class ai provider activations" ON public.ai_provider_activations;
CREATE POLICY "Class members read class ai provider activations"
  ON public.ai_provider_activations FOR SELECT
  USING (
    scope = 'class'
    AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_class_student(scope_id)
    )
  );

DROP POLICY IF EXISTS "Class co-teachers manage class ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Class co-teachers manage class ai function bindings"
  ON public.ai_function_bindings FOR ALL
  USING (scope = 'class' AND public.is_class_co_teacher(scope_id))
  WITH CHECK (scope = 'class' AND public.is_class_co_teacher(scope_id));

DROP POLICY IF EXISTS "Class members read class ai function bindings" ON public.ai_function_bindings;
CREATE POLICY "Class members read class ai function bindings"
  ON public.ai_function_bindings FOR SELECT
  USING (
    scope = 'class'
    AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_class_student(scope_id)
    )
  );

CREATE OR REPLACE FUNCTION public.ai_catalog_enforce_institution_policy()
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

  IF NEW.scope = 'institution' AND NEW.use_platform_default = true THEN
    SELECT s.allow_use_platform_defaults INTO v_allow_platform_defaults
      FROM public.ai_institution_settings s
      WHERE s.institution_id = NEW.scope_id;

    IF v_allow_platform_defaults IS NOT NULL AND v_allow_platform_defaults = false THEN
      RAISE EXCEPTION 'Institution may not use platform AI defaults for this institution';
    END IF;
  END IF;

  IF NEW.scope = 'class' THEN
    SELECT c.institution_id INTO v_institution_id
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_institution_id IS NOT NULL THEN
      IF TG_TABLE_NAME = 'ai_provider_activations'
         AND NEW.use_platform_default = false
         AND NEW.is_active = true THEN
        SELECT s.allow_child_override INTO v_allow_override
          FROM public.ai_institution_settings s
          WHERE s.institution_id = v_institution_id;

        IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
          RAISE EXCEPTION 'Class AI override is disabled by the institution';
        END IF;
      END IF;

      IF TG_TABLE_NAME = 'ai_function_bindings' THEN
        SELECT s.allow_child_override INTO v_allow_override
          FROM public.ai_institution_settings s
          WHERE s.institution_id = v_institution_id;

        IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
          RAISE EXCEPTION 'Class AI override is disabled by the institution';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_provider_activations_enforce_policy_trg ON public.ai_provider_activations;
CREATE TRIGGER ai_provider_activations_enforce_policy_trg
  BEFORE INSERT OR UPDATE ON public.ai_provider_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_catalog_enforce_institution_policy();

DROP TRIGGER IF EXISTS ai_function_bindings_enforce_policy_trg ON public.ai_function_bindings;
CREATE TRIGGER ai_function_bindings_enforce_policy_trg
  BEFORE INSERT OR UPDATE ON public.ai_function_bindings
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_catalog_enforce_institution_policy();
