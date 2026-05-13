-- Migration: Phase A — polymorphic settings layer.
--
-- Introduces a single `setting_values` table keyed by (scope, scope_id, key)
-- so the platform can grow new settings without schema churn and grow new
-- scopes (group, assignment, ...) by extending one enum.
--
-- Inheritance / locks
-- -------------------
--   * `value`                  jsonb — current value at this scope.
--   * `allow_admin_edit`       Set by the scope ABOVE.
--                                * For 'institution' rows: super admin only.
--                                * Controls whether the admin OF this scope may
--                                  change `value`. Super admin always bypasses.
--   * `allow_child_override`   Set by the admin OF this scope.
--                                * For 'institution' rows: whether classes in
--                                  this institution may override `value`.
--                                * Future scopes follow the same chain.
--
-- TS layer (src/lib/settings/*) owns:
--   * the list of valid setting keys (registry — unknown keys are ignored on
--     resolve, never persisted),
--   * defaults when no row exists,
--   * the capabilities matrix used by both UI and server actions.
--
-- Depends on:
--   * supabase_institutions_phase_a_migration.sql
--   * supabase_institutions_phase_d_migration.sql (is_platform_super_admin,
--     is_institution_admin, is_class_institution_admin)
--
-- Rollback:
--   drop trigger if exists institutions_cleanup_setting_values_trg on public.institutions;
--   drop trigger if exists classes_cleanup_setting_values_trg on public.classes;
--   drop function if exists public.cleanup_setting_values_for_institution();
--   drop function if exists public.cleanup_setting_values_for_class();
--   drop trigger if exists setting_values_enforce_locks_trg on public.setting_values;
--   drop function if exists public.setting_values_enforce_locks();
--   drop policy if exists "Class owners manage class settings" on public.setting_values;
--   drop policy if exists "Institution admins manage settings" on public.setting_values;
--   drop policy if exists "Super admins manage all settings" on public.setting_values;
--   drop table if exists public.setting_values;
--   drop type if exists public.setting_scope;

-- =====================================================================
-- 1. Enum + table
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'setting_scope') THEN
    CREATE TYPE public.setting_scope AS ENUM ('institution', 'class');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.setting_values (
  scope                public.setting_scope NOT NULL,
  scope_id             uuid                 NOT NULL,
  key                  text                 NOT NULL,
  value                jsonb                NOT NULL,
  allow_admin_edit     boolean              NOT NULL DEFAULT true,
  allow_child_override boolean              NOT NULL DEFAULT true,
  updated_by           uuid REFERENCES auth.users(id),
  updated_at           timestamptz          NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, key)
);

CREATE INDEX IF NOT EXISTS setting_values_scope_idx
  ON public.setting_values (scope, scope_id);

CREATE INDEX IF NOT EXISTS setting_values_key_idx
  ON public.setting_values (key);

ALTER TABLE public.setting_values ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. RLS policies
-- =====================================================================

-- Super admin: full RW on every row.
DROP POLICY IF EXISTS "Super admins manage all settings" ON public.setting_values;
CREATE POLICY "Super admins manage all settings"
  ON public.setting_values FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

-- Institution admin: RW on their institution's row OR a class row in their institution.
DROP POLICY IF EXISTS "Institution admins manage settings" ON public.setting_values;
CREATE POLICY "Institution admins manage settings"
  ON public.setting_values FOR ALL
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

-- Class owner: RW on class rows for classes they own.
DROP POLICY IF EXISTS "Class owners manage class settings" ON public.setting_values;
CREATE POLICY "Class owners manage class settings"
  ON public.setting_values FOR ALL
  USING (
    scope = 'class'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = setting_values.scope_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    scope = 'class'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = setting_values.scope_id AND c.created_by = auth.uid()
    )
  );

-- =====================================================================
-- 3. Lock-enforcement trigger
--
-- RLS lets the right roles touch the right rows; the trigger enforces the
-- per-row locks (allow_admin_edit, allow_child_override) on top of RLS so
-- the rules cannot be bypassed by a hand-rolled server action.
-- Super admin always bypasses lock enforcement.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.setting_values_enforce_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_allow_override boolean;
  v_class_institution     uuid;
BEGIN
  -- Super admin can do anything.
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- allow_admin_edit may only change by a super admin (handled above).
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit on setting_values';
    END IF;

    -- When the admin-edit lock is engaged, only super admins may change value.
    IF NEW.scope = 'institution'
       AND OLD.allow_admin_edit = false
       AND NEW.value IS DISTINCT FROM OLD.value THEN
      RAISE EXCEPTION 'Institution setting is locked by platform; value cannot be changed';
    END IF;
  END IF;

  -- Class-scoped writes additionally require the parent institution to allow
  -- child override (lookup the parent setting row if it exists).
  IF NEW.scope = 'class' THEN
    SELECT c.institution_id INTO v_class_institution
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_class_institution IS NOT NULL THEN
      SELECT sv.allow_child_override INTO v_parent_allow_override
        FROM public.setting_values sv
        WHERE sv.scope = 'institution'
          AND sv.scope_id = v_class_institution
          AND sv.key = NEW.key;

      -- If no parent row exists, the institution is using the platform default
      -- and class override is allowed (registry default).
      IF v_parent_allow_override IS NOT NULL AND v_parent_allow_override = false THEN
        RAISE EXCEPTION 'Class override is disabled by the institution for key %', NEW.key;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setting_values_enforce_locks_trg ON public.setting_values;
CREATE TRIGGER setting_values_enforce_locks_trg
  BEFORE INSERT OR UPDATE ON public.setting_values
  FOR EACH ROW
  EXECUTE FUNCTION public.setting_values_enforce_locks();

-- =====================================================================
-- 4. Parent-cleanup triggers (polymorphic FK substitute)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cleanup_setting_values_for_institution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.setting_values
    WHERE scope = 'institution' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_setting_values_for_class()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.setting_values
    WHERE scope = 'class' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS institutions_cleanup_setting_values_trg ON public.institutions;
CREATE TRIGGER institutions_cleanup_setting_values_trg
  AFTER DELETE ON public.institutions
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_setting_values_for_institution();

DROP TRIGGER IF EXISTS classes_cleanup_setting_values_trg ON public.classes;
CREATE TRIGGER classes_cleanup_setting_values_trg
  AFTER DELETE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_setting_values_for_class();
