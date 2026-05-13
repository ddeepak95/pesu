-- Fully role-based class teachers: class_teachers is the authorization source.
-- Roles: owner (exactly one per class), co-owner, admin, co-teacher.
-- classes.created_by stays immutable audit; backfill owner rows from it.
--
-- Depends on: institutions phase D (is_platform_super_admin, is_class_institution_admin),
--   teacher invites, class_teachers, settings_phase_a (optional).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. Relax role CHECK, normalize data, add roles, constrain one owner
-- =====================================================================

ALTER TABLE public.class_teachers
  DROP CONSTRAINT IF EXISTS class_teachers_role_check;

-- Legacy mistake: non-creators marked owner → co-teacher
UPDATE public.class_teachers ct
SET role = 'co-teacher'
FROM public.classes c
WHERE ct.class_id = c.id
  AND ct.role = 'owner'
  AND ct.teacher_id IS DISTINCT FROM c.created_by;

-- Creator rows: ensure primary owner role
UPDATE public.class_teachers ct
SET role = 'owner'
FROM public.classes c
WHERE ct.class_id = c.id
  AND ct.teacher_id = c.created_by;

-- Insert missing owner row per class
INSERT INTO public.class_teachers (class_id, teacher_id, role)
SELECT c.id, c.created_by, 'owner'
FROM public.classes c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.class_teachers ct
  WHERE ct.class_id = c.id
    AND ct.teacher_id = c.created_by
);

ALTER TABLE public.class_teachers
  ADD CONSTRAINT class_teachers_role_check CHECK (
    role = ANY (
      ARRAY[
        'owner'::text,
        'co-owner'::text,
        'admin'::text,
        'co-teacher'::text
      ]
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS class_teachers_one_owner_per_class
  ON public.class_teachers (class_id)
  WHERE (role = 'owner');

-- =====================================================================
-- 2. Auth helpers (SECURITY DEFINER for auth.uid(); STABLE)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_class_owner(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_co_owner(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'co-owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher_admin(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_full_class_control(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = ANY (ARRAY['owner'::text, 'co-owner'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.can_configure_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_full_class_control(p_class_id)
    OR public.is_class_teacher_admin(p_class_id)
    OR public.is_platform_super_admin()
    OR public.is_class_institution_admin(p_class_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_class_roster(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_configure_class(p_class_id);
$$;

CREATE OR REPLACE FUNCTION public.can_promote_co_owner(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_full_class_control(p_class_id)
    OR public.is_platform_super_admin()
    OR public.is_class_institution_admin(p_class_id);
$$;

REVOKE ALL ON FUNCTION public.is_class_co_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_class_teacher_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_full_class_control(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_configure_class(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_class_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_promote_co_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_class_co_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_teacher_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_full_class_control(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_configure_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_class_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_promote_co_owner(uuid) TO authenticated;

-- =====================================================================
-- 3. Triggers: new class → owner row; immutability / role guards
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_classes_after_insert_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.class_teachers (class_id, teacher_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (class_id, teacher_id)
  DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_after_insert_owner_trg ON public.classes;
CREATE TRIGGER classes_after_insert_owner_trg
  AFTER INSERT ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_classes_after_insert_owner();

CREATE OR REPLACE FUNCTION public.guard_classes_immutable_and_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT public.is_platform_super_admin() THEN
      RAISE EXCEPTION 'classes.created_by is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'deleted' THEN
      IF NOT (
        public.has_full_class_control(OLD.id)
        OR public.is_platform_super_admin()
        OR public.is_class_institution_admin(OLD.id)
      ) THEN
        RAISE EXCEPTION 'Only full-control teachers, institution admins, or platform super admins may archive/delete a class';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_classes_soft_delete_trg ON public.classes;
CREATE TRIGGER guard_classes_soft_delete_trg
  BEFORE UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_classes_immutable_and_delete();

CREATE OR REPLACE FUNCTION public.class_teachers_enforce_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role = 'co-owner' OR OLD.role = 'co-owner' THEN
      IF NOT public.can_promote_co_owner(OLD.class_id) THEN
        RAISE EXCEPTION 'Not permitted to change co-owner role';
      END IF;
    END IF;
    IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
      IF NOT (
        public.is_platform_super_admin()
        OR public.is_class_institution_admin(OLD.class_id)
      ) THEN
        RAISE EXCEPTION 'Primary owner role cannot be changed in place';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_teachers_enforce_role_change_trg ON public.class_teachers;
CREATE TRIGGER class_teachers_enforce_role_change_trg
  BEFORE UPDATE ON public.class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION public.class_teachers_enforce_role_change();

CREATE OR REPLACE FUNCTION public.class_teachers_prevent_owner_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner'
     AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = OLD.class_id) THEN
    RAISE EXCEPTION 'Cannot remove the primary owner; archive or delete the class instead';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS class_teachers_prevent_owner_delete_trg ON public.class_teachers;
CREATE TRIGGER class_teachers_prevent_owner_delete_trg
  BEFORE DELETE ON public.class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION public.class_teachers_prevent_owner_delete();

-- =====================================================================
-- 4. RPC and function auth rewrites
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reconfigure_class_groups(
  p_class_id uuid,
  p_new_group_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_group_count INTEGER;
  v_group RECORD;
  v_student RECORD;
BEGIN
  IF p_new_group_count < 1 THEN
    RAISE EXCEPTION 'group_count must be >= 1';
  END IF;

  IF NOT public.can_configure_class(p_class_id) THEN
    RAISE EXCEPTION 'Not permitted to change group configuration for this class';
  END IF;

  SELECT group_count
    INTO v_old_group_count
    FROM classes
    WHERE id = p_class_id;

  IF v_old_group_count IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  IF p_new_group_count = v_old_group_count THEN
    RETURN;
  END IF;

  IF p_new_group_count > v_old_group_count THEN
    UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
    PERFORM ensure_class_groups(p_class_id);
    RETURN;
  END IF;

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

CREATE OR REPLACE FUNCTION public.create_teacher_invite(
  p_class_id UUID,
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '100 years'),
  p_max_uses INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
  v_hash TEXT;
BEGIN
  IF NOT public.can_manage_class_roster(p_class_id) THEN
    RAISE EXCEPTION 'Not permitted to manage teacher invites for this class';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO class_teacher_invites (class_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at)
  VALUES (p_class_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (class_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    token = EXCLUDED.token,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_teacher_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id UUID;
BEGIN
  SELECT class_id INTO v_class_id FROM class_teacher_invites WHERE id = p_invite_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT public.can_manage_class_roster(v_class_id) THEN
    RAISE EXCEPTION 'Not permitted to revoke teacher invites for this class';
  END IF;

  UPDATE class_teacher_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_teacher_invite(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_class_public_id TEXT;
  v_is_new_member BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept invite';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM class_teacher_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  SELECT class_id INTO v_class_public_id FROM classes WHERE id = v_invite.class_id;

  IF public.is_class_owner(v_invite.class_id) THEN
    RETURN v_class_public_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM class_teachers
    WHERE class_teachers.class_id = v_invite.class_id
      AND class_teachers.teacher_id = auth.uid()
  ) THEN
    RETURN v_class_public_id;
  END IF;

  INSERT INTO class_teachers (class_id, teacher_id, role)
  VALUES (v_invite.class_id, auth.uid(), 'co-teacher');
  v_is_new_member := TRUE;

  IF v_is_new_member THEN
    UPDATE class_teacher_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_class_teachers_with_user_info(p_class_id uuid)
RETURNS TABLE(
  id uuid,
  class_id uuid,
  teacher_id uuid,
  role text,
  joined_at timestamptz,
  teacher_email text,
  teacher_display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (
       public.is_class_co_teacher(p_class_id)
       OR public.is_platform_super_admin()
       OR public.is_class_institution_admin(p_class_id)
     ) THEN
    RAISE EXCEPTION 'Not permitted to list class teachers';
  END IF;

  RETURN QUERY
  SELECT
    ct.id,
    ct.class_id,
    ct.teacher_id,
    ct.role,
    ct.joined_at,
    au.email::TEXT AS teacher_email,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT AS teacher_display_name
  FROM class_teachers ct
  LEFT JOIN auth.users au ON ct.teacher_id = au.id
  WHERE ct.class_id = p_class_id
  ORDER BY ct.joined_at ASC;
END;
$$;

-- =====================================================================
-- 5. RLS policy updates (drop/recreate where needed)
-- =====================================================================

DROP POLICY IF EXISTS "Owners can delete class teachers" ON public.class_teachers;
CREATE POLICY "Roster managers can delete class teachers"
  ON public.class_teachers FOR DELETE
  USING (public.can_manage_class_roster(class_id));

DROP POLICY IF EXISTS "Owners can view all class teachers" ON public.class_teachers;
CREATE POLICY "Teachers and roster managers can view class teachers"
  ON public.class_teachers FOR SELECT
  USING (
    public.can_manage_class_roster(class_id)
    OR public.is_class_co_teacher(class_id)
  );

DROP POLICY IF EXISTS "Owner can view teacher invites" ON public.class_teacher_invites;
DROP POLICY IF EXISTS "Owner can create teacher invites" ON public.class_teacher_invites;
DROP POLICY IF EXISTS "Owner can update teacher invites" ON public.class_teacher_invites;

CREATE POLICY "Roster managers can view teacher invites"
  ON public.class_teacher_invites FOR SELECT
  USING (public.can_manage_class_roster(class_id));

CREATE POLICY "Roster managers can create teacher invites"
  ON public.class_teacher_invites FOR INSERT
  WITH CHECK (public.can_manage_class_roster(class_id));

CREATE POLICY "Roster managers can update teacher invites"
  ON public.class_teacher_invites FOR UPDATE
  USING (public.can_manage_class_roster(class_id))
  WITH CHECK (public.can_manage_class_roster(class_id));

DROP POLICY IF EXISTS "Owner can manage class groups" ON public.class_groups;
CREATE POLICY "Class config managers manage class groups"
  ON public.class_groups FOR ALL
  USING (public.can_configure_class(class_id))
  WITH CHECK (public.can_configure_class(class_id));

DROP POLICY IF EXISTS "Class owners manage class settings" ON public.setting_values;
CREATE POLICY "Class config managers manage class settings"
  ON public.setting_values FOR ALL
  USING (
    scope = 'class'
    AND public.can_configure_class(scope_id)
  )
  WITH CHECK (
    scope = 'class'
    AND public.can_configure_class(scope_id)
  );

DROP POLICY IF EXISTS "Owners can manage their classes" ON public.classes;
DROP POLICY IF EXISTS "Users can update their own classes" ON public.classes;
CREATE POLICY "Class config managers update classes"
  ON public.classes FOR UPDATE
  USING (public.can_configure_class(id))
  WITH CHECK (public.can_configure_class(id));

DROP POLICY IF EXISTS "Users can delete their own classes" ON public.classes;
CREATE POLICY "Full control may delete classes"
  ON public.classes FOR DELETE
  USING (
    public.has_full_class_control(id)
    OR public.is_platform_super_admin()
    OR public.is_class_institution_admin(id)
  );

CREATE POLICY "Roster managers update class teacher roles"
  ON public.class_teachers FOR UPDATE
  USING (public.can_manage_class_roster(class_id))
  WITH CHECK (public.can_manage_class_roster(class_id));

CREATE OR REPLACE FUNCTION public.create_student_invite(
  p_class_id uuid,
  p_expires_at timestamp with time zone DEFAULT (timezone('utc'::text, now()) + interval '100 years'),
  p_max_uses integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
  v_hash TEXT;
BEGIN
  IF NOT public.can_manage_class_roster(p_class_id) THEN
    RAISE EXCEPTION 'Not permitted to create student invites for this class';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO class_student_invites (class_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at)
  VALUES (p_class_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (class_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    token = EXCLUDED.token,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;

-- Regenerate / revoke student invites: roster managers only (not plain co-teachers).
CREATE OR REPLACE FUNCTION public.revoke_student_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id UUID;
BEGIN
  SELECT class_id INTO v_class_id FROM class_student_invites WHERE id = p_invite_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT public.can_manage_class_roster(v_class_id) THEN
    RAISE EXCEPTION 'Not permitted to revoke student invites for this class';
  END IF;

  UPDATE class_student_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;
