-- Institution-owned activity templates.
--
-- Extends the activity_templates ownership model to `owner_scope='institution'`,
-- the last of the four scopes the table already models but had no authoring
-- surface for. Institution admins can now create/edit templates scoped to
-- their own institution, and toggle `default_listed` on them exactly like a
-- platform super admin does for system templates — except scoped to classes
-- within that institution rather than every class platform-wide (consulted by
-- `listAvailableTemplatesForClass`, which additionally filters by the class's
-- own institution_id).
--
-- `is_institution_teacher` lets any teacher co-teaching a class in an
-- institution READ that institution's templates (needed both for the
-- auto-listed palette and for "Add from Library -> Institution").

CREATE OR REPLACE FUNCTION public.is_institution_teacher(p_institution_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    JOIN public.classes c ON c.id = ct.class_id
    WHERE c.institution_id = p_institution_id
      AND ct.teacher_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_institution_teacher(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_institution_teacher(uuid) TO authenticated;

DROP POLICY IF EXISTS "activity_templates_read" ON public.activity_templates;
CREATE POLICY "activity_templates_read" ON public.activity_templates
  FOR SELECT TO authenticated
  USING (
    owner_scope = 'system'
    OR visibility = 'public'
    OR (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND (
      public.is_class_co_teacher(owner_class_id)
      OR public.is_platform_super_admin()
      OR public.is_class_institution_admin(owner_class_id)
    ))
    OR (owner_scope = 'institution' AND (
      public.is_institution_admin(institution_id)
      OR public.is_institution_teacher(institution_id)
      OR public.is_platform_super_admin()
    ))
    OR public.is_template_in_my_class_palette(id)
  );

DROP POLICY IF EXISTS "activity_templates_write" ON public.activity_templates;
CREATE POLICY "activity_templates_write" ON public.activity_templates
  FOR ALL TO authenticated
  USING (
    (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
    OR (owner_scope = 'institution' AND public.is_institution_admin(institution_id))
    OR public.is_platform_super_admin()
  )
  WITH CHECK (
    (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
    OR (owner_scope = 'institution' AND public.is_institution_admin(institution_id))
    OR public.is_platform_super_admin()
  );
