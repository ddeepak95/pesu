-- Extend template_scope_enablement to a genuine institution curation tier for
-- SYSTEM templates: an institution admin can override a system template's
-- platform-wide default_listed baseline for every class in their institution
-- (a class can still override the institution-resolved value further, same
-- as today). Institution-owned templates are unaffected — they already
-- control their own default_listed column directly via setTemplateDefaultListed.
--
-- `scope` already accepts 'institution' (public.setting_scope), so this is
-- RLS-only: both policies only had a 'class' branch until now.

DROP POLICY IF EXISTS "template_scope_enablement_read" ON public.template_scope_enablement;
CREATE POLICY "template_scope_enablement_read" ON public.template_scope_enablement
  FOR SELECT TO authenticated
  USING (
    (scope = 'class' AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_platform_super_admin()
      OR public.is_class_institution_admin(scope_id)
    ))
    OR (scope = 'institution' AND (
      public.is_institution_admin(scope_id)
      OR public.is_institution_teacher(scope_id)
      OR public.is_platform_super_admin()
    ))
  );

DROP POLICY IF EXISTS "template_scope_enablement_write" ON public.template_scope_enablement;
CREATE POLICY "template_scope_enablement_write" ON public.template_scope_enablement
  FOR ALL TO authenticated
  USING (
    (scope = 'class' AND public.can_configure_class(scope_id))
    OR (scope = 'institution' AND (
      public.is_institution_admin(scope_id) OR public.is_platform_super_admin()
    ))
  )
  WITH CHECK (
    (scope = 'class' AND public.can_configure_class(scope_id))
    OR (scope = 'institution' AND (
      public.is_institution_admin(scope_id) OR public.is_platform_super_admin()
    ))
  );
