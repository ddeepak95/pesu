-- Platform-manageable activity templates: per-system-template default listing,
-- plus closing a class-read RLS gap for platform/institution admins.
--
-- 1. `default_listed` lets a super admin seed a system template as opt-in
--    (available in the platform library / "Add from Library", but not
--    automatically in every class's palette) instead of always-on. Defaults
--    to true so the 4 existing built-ins keep today's always-on behavior.
--
-- 2. `activity_templates_read` / `template_scope_enablement_read` only checked
--    `is_class_co_teacher`, unlike the corresponding WRITE policies which
--    already special-case `is_platform_super_admin()` / `is_class_institution_admin()`.
--    That made a class's activity-type palette under-report (or 404 the manage
--    page entirely) for a super admin / institution admin viewing a class they
--    don't co-teach. Bring the read policies in line with the write policies.

ALTER TABLE public.activity_templates
  ADD COLUMN IF NOT EXISTS default_listed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.activity_templates.default_listed IS
  'Only consulted for owner_scope=system rows: true = automatically in every class palette (prunable per-class); false = opt-in only, surfaced in Add from Library but requires an explicit per-class add. Unused for other owner scopes.';

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
    OR public.is_template_in_my_class_palette(id)
  );

DROP POLICY IF EXISTS "template_scope_enablement_read" ON public.template_scope_enablement;
CREATE POLICY "template_scope_enablement_read" ON public.template_scope_enablement
  FOR SELECT TO authenticated
  USING (
    scope = 'class' AND (
      public.is_class_co_teacher(scope_id)
      OR public.is_platform_super_admin()
      OR public.is_class_institution_admin(scope_id)
    )
  );
