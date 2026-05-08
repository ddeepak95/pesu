-- Migration: Phase D — RLS helpers, additive policies for super admin and
-- institution admin on public.classes and the class-settings tables, plus
-- super-admin-only policies for the institution / member / audit / super-admin
-- tables and a guard trigger that prevents non-super-admins from changing
-- classes.institution_id outside the move RPC.
--
-- Depends on:
--   * supabase_institutions_phase_a_migration.sql
--   * supabase_institutions_phase_b_migration.sql
--   * supabase_institutions_phase_c_migration.sql
--
-- Settings tables included in the sweep: class_mandatory_fields, class_groups,
-- class_group_memberships, class_teachers, class_teacher_invites. Authoring
-- and student-data tables are intentionally left as-is until a follow-up
-- phase (see reorg-plan.md §13 checklist).
--
-- Rollback:
--   drop policy if exists "Super and institution admins manage class teacher invites" on public.class_teacher_invites;
--   drop policy if exists "Super and institution admins manage class teachers" on public.class_teachers;
--   drop policy if exists "Super and institution admins manage class group memberships" on public.class_group_memberships;
--   drop policy if exists "Super and institution admins manage class groups" on public.class_groups;
--   drop policy if exists "Super and institution admins manage class mandatory fields" on public.class_mandatory_fields;
--   drop policy if exists "Super admins read super admin list" on public.platform_super_admins;
--   drop policy if exists "Super admins read class moves audit" on public.class_institution_moves;
--   drop policy if exists "Super admins manage institution members" on public.institution_members;
--   drop policy if exists "Institution admins read own institution members" on public.institution_members;
--   drop policy if exists "Super admins read all institution members" on public.institution_members;
--   drop policy if exists "Super admins manage institutions" on public.institutions;
--   drop policy if exists "Institution admins read their institutions" on public.institutions;
--   drop policy if exists "Super admins read all institutions" on public.institutions;
--   drop trigger if exists guard_classes_institution_change_trg on public.classes;
--   drop function if exists public.guard_classes_institution_change();
--   drop policy if exists "Super admins manage all classes" on public.classes;
--   drop policy if exists "Institution admins manage their institution classes" on public.classes;
--   drop function if exists public.get_users_by_ids(uuid[]);
--   drop function if exists public.find_user_id_by_email(text);
--   drop function if exists public.is_class_institution_admin(uuid);
--   drop function if exists public.is_default_institution(uuid);
--   drop function if exists public.user_institution_ids();
--   drop function if exists public.is_institution_admin(uuid);
--   drop function if exists public.is_platform_super_admin();
--   -- Restore reconfigure_class_groups owner-only check (see schema dump §1119).

-- =====================================================================
-- 1. Helpers
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_super_admins WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_institution_admin(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institution_members
    WHERE institution_id = p_institution_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_institution_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id
    FROM public.institution_members
    WHERE user_id = auth.uid() AND role = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_default_institution(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_default, false)
    FROM public.institutions
    WHERE id = p_institution_id;
$$;

-- Convenience used by the class-settings RLS sweep below: caller is an
-- institution admin of the given class's institution.
CREATE OR REPLACE FUNCTION public.is_class_institution_admin(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id
      AND public.is_institution_admin(c.institution_id)
  );
$$;

-- =====================================================================
-- 2. Email-to-user lookup and bulk user-by-id lookup (super admin only)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'find_user_id_by_email: caller is not a platform super admin';
  END IF;

  SELECT id INTO v_id
    FROM auth.users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_users_by_ids(p_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'get_users_by_ids: caller is not a platform super admin';
  END IF;

  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
      WHERE u.id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_users_by_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_users_by_ids(uuid[]) TO authenticated;

-- =====================================================================
-- 3. public.classes — additive policies for institution / super admin
-- =====================================================================

-- Existing owner / co-teacher / student policies remain untouched. Postgres
-- OR-combines permissive policies, so adding these grants additional access
-- without affecting the existing paths.

CREATE POLICY "Institution admins manage their institution classes"
  ON public.classes FOR ALL
  USING (public.is_institution_admin(institution_id))
  WITH CHECK (public.is_institution_admin(institution_id));

CREATE POLICY "Super admins manage all classes"
  ON public.classes FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

-- Guard trigger: only super admins may change classes.institution_id.
-- The move_class_to_institution() RPC runs SECURITY DEFINER but auth.uid()
-- still resolves to the caller, so super admins pass through naturally.
CREATE OR REPLACE FUNCTION public.guard_classes_institution_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
     AND NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Only platform super admins may change classes.institution_id; use move_class_to_institution()';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_classes_institution_change_trg ON public.classes;
CREATE TRIGGER guard_classes_institution_change_trg
  BEFORE UPDATE OF institution_id ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_classes_institution_change();

-- =====================================================================
-- 4. New tables — policies
-- =====================================================================

-- public.institutions
CREATE POLICY "Super admins read all institutions"
  ON public.institutions FOR SELECT
  USING (public.is_platform_super_admin());
CREATE POLICY "Institution admins read their institutions"
  ON public.institutions FOR SELECT
  USING (public.is_institution_admin(id));
CREATE POLICY "Super admins manage institutions"
  ON public.institutions FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

-- public.institution_members
CREATE POLICY "Super admins read all institution members"
  ON public.institution_members FOR SELECT
  USING (public.is_platform_super_admin());
CREATE POLICY "Institution admins read own institution members"
  ON public.institution_members FOR SELECT
  USING (public.is_institution_admin(institution_id));
CREATE POLICY "Super admins manage institution members"
  ON public.institution_members FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

-- public.class_institution_moves (audit) — super admin SELECT only.
-- Writes happen exclusively via the SECURITY DEFINER move RPC.
CREATE POLICY "Super admins read class moves audit"
  ON public.class_institution_moves FOR SELECT
  USING (public.is_platform_super_admin());

-- public.platform_super_admins — super admin SELECT only.
-- INSERT/UPDATE/DELETE is service-role only by design.
CREATE POLICY "Super admins read super admin list"
  ON public.platform_super_admins FOR SELECT
  USING (public.is_platform_super_admin());

-- =====================================================================
-- 5. Class-settings RLS sweep (additive)
-- =====================================================================

-- Each existing owner / co-teacher / student policy on these tables stays
-- untouched. We add one permissive FOR ALL policy per table that grants
-- super admins and institution admins (of the class's institution) full
-- read/write access.

CREATE POLICY "Super and institution admins manage class mandatory fields"
  ON public.class_mandatory_fields FOR ALL
  USING (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id));

CREATE POLICY "Super and institution admins manage class groups"
  ON public.class_groups FOR ALL
  USING (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id));

CREATE POLICY "Super and institution admins manage class group memberships"
  ON public.class_group_memberships FOR ALL
  USING (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id));

CREATE POLICY "Super and institution admins manage class teachers"
  ON public.class_teachers FOR ALL
  USING (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id));

CREATE POLICY "Super and institution admins manage class teacher invites"
  ON public.class_teacher_invites FOR ALL
  USING (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_class_institution_admin(class_id));

-- =====================================================================
-- 6. reconfigure_class_groups: extend auth check to super / institution admins
-- =====================================================================

-- Body is byte-for-byte identical to the original (schema dump §1119) except
-- for the auth check, which now also accepts is_platform_super_admin() and
-- is_institution_admin(class.institution_id).

CREATE OR REPLACE FUNCTION public.reconfigure_class_groups(
  p_class_id uuid,
  p_new_group_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner UUID;
  v_institution UUID;
  v_old_group_count INTEGER;
  v_group RECORD;
  v_student RECORD;
BEGIN
  IF p_new_group_count < 1 THEN
    RAISE EXCEPTION 'group_count must be >= 1';
  END IF;

  SELECT created_by, institution_id, group_count
    INTO v_owner, v_institution, v_old_group_count
    FROM classes
    WHERE id = p_class_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  IF v_owner <> auth.uid()
     AND NOT public.is_platform_super_admin()
     AND NOT public.is_institution_admin(v_institution)
  THEN
    RAISE EXCEPTION 'Only the class owner, an institution admin, or a platform super admin can change group count';
  END IF;

  IF p_new_group_count = v_old_group_count THEN
    RETURN;
  END IF;

  -- Increasing: create missing groups
  IF p_new_group_count > v_old_group_count THEN
    UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
    PERFORM ensure_class_groups(p_class_id);
    RETURN;
  END IF;

  -- Shrinking: move members from groups >= new_count into remaining groups
  FOR v_group IN
    SELECT id, group_index FROM class_groups
    WHERE class_id = p_class_id
      AND group_index >= p_new_group_count
    ORDER BY group_index ASC
  LOOP
    FOR v_student IN
      SELECT m.student_id
      FROM class_group_memberships m
      WHERE m.class_id = p_class_id
        AND m.group_id = v_group.id
      ORDER BY m.assigned_at ASC
    LOOP
      DELETE FROM class_group_memberships
      WHERE class_id = p_class_id AND student_id = v_student.student_id;

      PERFORM assign_student_to_group(p_class_id, v_student.student_id);
    END LOOP;

    DELETE FROM class_groups WHERE id = v_group.id;
  END LOOP;

  UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
  PERFORM ensure_class_groups(p_class_id);
END;
$$;
