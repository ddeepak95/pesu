-- Transfer primary class owner (class_teachers.role = 'owner').
-- Callable by platform super admins or institution admins for the class's institution.
-- classes.created_by is unchanged (audit only).
--
-- Depends on: supabase_class_teacher_roles_rbac.sql (or equivalent helpers).

CREATE OR REPLACE FUNCTION public.transfer_class_primary_owner(
  p_class_id uuid,
  p_new_owner_teacher_id uuid,
  p_demote_previous_to text DEFAULT 'co-owner'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT (
    public.is_platform_super_admin()
    OR public.is_class_institution_admin(p_class_id)
  ) THEN
    RAISE EXCEPTION 'Only a platform super admin or institution admin for this class may transfer primary ownership';
  END IF;

  IF p_demote_previous_to IS NULL
     OR p_demote_previous_to NOT IN ('co-owner', 'co-teacher') THEN
    RAISE EXCEPTION 'demote value must be co-owner or co-teacher';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  SELECT teacher_id
    INTO v_old_owner
    FROM public.class_teachers
    WHERE class_id = p_class_id
      AND role = 'owner'
    LIMIT 1;

  IF v_old_owner IS NULL THEN
    RAISE EXCEPTION 'No primary owner row found for this class';
  END IF;

  IF p_new_owner_teacher_id = v_old_owner THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.class_teachers
    WHERE class_id = p_class_id
      AND teacher_id = p_new_owner_teacher_id
      AND role IS DISTINCT FROM 'owner'
  ) THEN
    RAISE EXCEPTION 'New primary owner must be an existing teacher on this class';
  END IF;

  UPDATE public.class_teachers
  SET role = p_demote_previous_to
  WHERE class_id = p_class_id
    AND teacher_id = v_old_owner
    AND role = 'owner';

  UPDATE public.class_teachers
  SET role = 'owner'
  WHERE class_id = p_class_id
    AND teacher_id = p_new_owner_teacher_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_class_primary_owner(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_class_primary_owner(uuid, uuid, text) TO authenticated;
