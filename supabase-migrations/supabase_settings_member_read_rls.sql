-- Class teachers and enrolled students may read institution setting_values
-- (lock flags + inherited values) for classes in that institution.
-- Without this, client-side class settings resolution defaults locks to
-- allow_child_override = true and shows the override toggle incorrectly.

DROP POLICY IF EXISTS "Class members read institution settings" ON public.setting_values;
CREATE POLICY "Class members read institution settings"
  ON public.setting_values FOR SELECT
  USING (
    scope = 'institution'
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = setting_values.scope_id
        AND (
          public.is_class_co_teacher(c.id)
          OR public.is_class_student(c.id)
        )
    )
  );
