-- Template availability (class palette) — Phase 2 of activity-templates-plan.md.
--
-- The second axis (§4, §8): "what activity types can I pick in THIS class?"
-- Ownership (who may edit) is unchanged; this is availability (a membership link).
--
-- The plan sketches `template_scope_enablement` under Phase 3, but Phase 2 still
-- needs to persist "add a personal template to this class" (§8, §7.3). Rather
-- than invent a throwaway table, we create the eventual `template_scope_enablement`
-- table now and use only its **class-scope, enabled=true** rows (the "Add to class"
-- link). The institution-precedence machinery it also supports —
-- `allow_child_override`, institution rows, `default_template_inclusion` — is left
-- UNUSED until Phase 3 layers it on. So Phase 2's palette is:
--   system (all)  +  class-owned (auto)  +  personal-you-added (a class-scope row).
--
-- Availability requires readability: a co-teacher must be able to READ a personal
-- template another teacher added to the class palette (to select + snapshot it).
-- The activity_templates read policy is extended for exactly that, via a
-- SECURITY DEFINER helper so the check bypasses the enablement table's own RLS.

-- ---------------------------------------------------------------------------
-- 1. template_scope_enablement (full eventual shape; Phase 2 uses class rows only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_scope_enablement (
  scope        public.setting_scope NOT NULL,          -- 'institution' | 'class' (Phase 2: 'class' only)
  scope_id     uuid NOT NULL,
  template_id  uuid NOT NULL REFERENCES public.activity_templates(id) ON DELETE CASCADE,
  enabled      boolean NOT NULL DEFAULT true,           -- explicit allow (true) / deny (false)
  allow_child_override boolean NOT NULL DEFAULT true,   -- Phase 3: may a class re-enable/disable an institution row?
  added_by     uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, template_id)
);

COMMENT ON TABLE public.template_scope_enablement IS
  'Class palette / institution allow-list for activity templates. Phase 2 uses only class-scope enabled rows (the "Add to class" link); institution precedence + allow_child_override + default policy are Phase 3.';

CREATE INDEX IF NOT EXISTS template_scope_enablement_template_idx
  ON public.template_scope_enablement (template_id);

-- ---------------------------------------------------------------------------
-- 2. Availability → readability: read a personal template added to a class you
--    co-teach. SECURITY DEFINER so the enablement lookup ignores that table's RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_template_in_my_class_palette(p_template_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.template_scope_enablement e
    WHERE e.template_id = p_template_id
      AND e.scope = 'class'
      AND e.enabled
      AND public.is_class_co_teacher(e.scope_id)
  );
$$;

ALTER FUNCTION public.is_template_in_my_class_palette(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_template_in_my_class_palette(uuid) TO authenticated;

-- Extend the activity_templates read policy with the palette-read grant. Keeps
-- the Phase 1/2 rules (system / public / own-user / class-owned) and adds
-- "readable because it's in a class palette I co-teach".
DROP POLICY IF EXISTS "activity_templates_read" ON public.activity_templates;
CREATE POLICY "activity_templates_read" ON public.activity_templates
  FOR SELECT TO authenticated
  USING (
    owner_scope = 'system'
    OR visibility = 'public'
    OR (owner_scope = 'user' AND owner_user_id = auth.uid())
    OR (owner_scope = 'class' AND public.is_class_co_teacher(owner_class_id))
    OR public.is_template_in_my_class_palette(id)
  );

-- ---------------------------------------------------------------------------
-- 3. RLS on template_scope_enablement.
--    Read: co-teachers of the class (they build assignments from the palette).
--    Write: class-config managers (mirrors setting_values' can_configure_class).
--    Institution-scope rows are Phase 3; no policy grants them yet.
-- ---------------------------------------------------------------------------
ALTER TABLE public.template_scope_enablement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_scope_enablement_read" ON public.template_scope_enablement;
CREATE POLICY "template_scope_enablement_read" ON public.template_scope_enablement
  FOR SELECT TO authenticated
  USING (scope = 'class' AND public.is_class_co_teacher(scope_id));

DROP POLICY IF EXISTS "template_scope_enablement_write" ON public.template_scope_enablement;
CREATE POLICY "template_scope_enablement_write" ON public.template_scope_enablement
  FOR ALL TO authenticated
  USING (scope = 'class' AND public.can_configure_class(scope_id))
  WITH CHECK (scope = 'class' AND public.can_configure_class(scope_id));
