-- SUPERSEDED by supabase_ai_capability_configs.sql — do not run on new environments.
-- Allow class teachers and enrolled students to read AI config metadata
-- (via ai_function_configs_meta) for readiness banners and inheritance display.
-- Writes remain limited to admins / class owners per existing policies.

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
