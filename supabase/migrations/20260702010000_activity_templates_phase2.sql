-- Activity templates — Phase 2 of dev-docs/activity-templates-plan.md.
--
-- Phase 1 shipped the table + 4 seeded system rows + assignment snapshot columns
-- with RLS limited to system/public/own-user read and own-user/super-admin write.
-- Phase 2 opens up the *personal + class* libraries, so this migration:
--   1. expands RLS to the class-owned library (co-editable by all co-teachers of
--      owner_class_id), keeping the existing system/public/own-user rules, and
--   2. backfills the 4 system rows with the inverted action↔type wiring
--      (definition.autoActions / definition.bulbAction, Appendix A) so a clone of
--      a system template carries its bulb/auto actions.
--
-- NOT in this phase: the template_scope_enablement curation table + institution
-- ownership RLS (Phase 3).
--
-- Ownership model (§7.8):
--   read:  system  OR  public  OR  own user rows  OR  class rows you co-teach
--   write: own user rows  OR  class rows you co-teach  OR  platform super admin
-- Edit rights come from ownership only — never from a template being available
-- in, or used by, a class.

-- ---------------------------------------------------------------------------
-- 1. RLS — add the class-owned library to read + write.
--    public.is_class_co_teacher(uuid) returns true for ANY class_teachers row
--    (owner/co-owner/admin/co-teacher), matching "all co-teachers co-edit".
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_templates_read" ON public.activity_templates;
CREATE POLICY "activity_templates_read" ON public.activity_templates
  FOR SELECT TO authenticated
  USING (
    owner_scope = 'system'
    OR visibility = 'public'
    OR (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
  );

DROP POLICY IF EXISTS "activity_templates_write" ON public.activity_templates;
CREATE POLICY "activity_templates_write" ON public.activity_templates
  FOR ALL TO authenticated
  USING (
    (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
    OR public.is_platform_super_admin()
  )
  WITH CHECK (
    (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
    OR public.is_platform_super_admin()
  );

-- ---------------------------------------------------------------------------
-- 2. Backfill the inverted action↔type wiring onto the 4 system rows.
--    Values come from the action registry (src/lib/multimodal/actions/registry.ts):
--      - suggested_response → bulb for speaking_practice
--      - display_content    → auto-available for code_review
--    `jsonb_build_object(...) || definition` gives the EXISTING definition
--    precedence, so this only fills the keys in where absent — it never clobbers
--    a super admin's later edits (the WHERE guard also keeps it idempotent and
--    leaves updated_at untouched so no spurious "update available" on snapshots).
-- ---------------------------------------------------------------------------
UPDATE public.activity_templates SET definition =
  jsonb_build_object('autoActions', '[]'::jsonb, 'bulbAction', 'none'::text) || definition
  WHERE id = '11111111-1111-4111-8111-000000000001' AND NOT (definition ? 'autoActions');

UPDATE public.activity_templates SET definition =
  jsonb_build_object('autoActions', '[]'::jsonb, 'bulbAction', 'none'::text) || definition
  WHERE id = '11111111-1111-4111-8111-000000000002' AND NOT (definition ? 'autoActions');

UPDATE public.activity_templates SET definition =
  jsonb_build_object('autoActions', '[]'::jsonb, 'bulbAction', 'suggested_response'::text) || definition
  WHERE id = '11111111-1111-4111-8111-000000000003' AND NOT (definition ? 'autoActions');

UPDATE public.activity_templates SET definition =
  jsonb_build_object('autoActions', '["display_content"]'::jsonb, 'bulbAction', 'none'::text) || definition
  WHERE id = '11111111-1111-4111-8111-000000000004' AND NOT (definition ? 'autoActions');
