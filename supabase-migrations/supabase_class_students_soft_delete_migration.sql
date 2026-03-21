-- Soft-delete / disable student enrollments in `class_students`.
--
-- Adds:
-- - `class_students.status` (active|deleted)
-- - `class_students.deleted_at`
--
-- Updates helper functions so "deleted" enrollments are excluded from:
-- - teacher student lists (`get_class_students_with_user_info`)
-- - student access control (`is_student_in_group`)
-- - student profile upsert checks (`upsert_student_class_info`)
-- - student invite acceptance (`accept_student_invite`)
--
-- Also adds a minimal RLS UPDATE policy so teachers/co-teachers can mark
-- a student's enrollment as deleted.

BEGIN;

-- =====================================================
-- ADD COLUMNS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'class_students'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.class_students
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'class_students'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.class_students
    ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Ensure constraint exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_students_status_check'
  ) THEN
    ALTER TABLE public.class_students
    ADD CONSTRAINT class_students_status_check
    CHECK (status IN ('active', 'deleted'));
  END IF;
END $$;

-- Backfill any nulls (should be rare but makes migration safe)
UPDATE public.class_students
SET status = 'active'
WHERE status IS NULL;

-- =====================================================
-- UPDATED HELPER FUNCTIONS
-- =====================================================

-- Teacher: list active students for a class (including group info)
CREATE OR REPLACE FUNCTION public.get_class_students_with_user_info(
  p_class_id UUID
)
RETURNS TABLE (
  student_id UUID,
  joined_at TIMESTAMP WITH TIME ZONE,
  student_email TEXT,
  student_display_name TEXT,
  group_id UUID,
  group_name TEXT,
  group_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.student_id,
    cs.joined_at,
    au.email::TEXT as student_email,
    COALESCE(
      -- Profile display name: value of the field marked as display name
      (SELECT sci.field_responses->>cmf.id::text
       FROM student_class_info sci
       JOIN class_mandatory_fields cmf
         ON cmf.class_id = cs.class_id
        AND cmf.is_display_name = TRUE
       WHERE sci.class_id = cs.class_id
         AND sci.student_id = cs.student_id
       LIMIT 1),
      -- Fallback: auth provider display name
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT as student_display_name,
    cgm.group_id,
    cg.name::TEXT as group_name,
    cg.group_index
  FROM class_students cs
  LEFT JOIN auth.users au
    ON cs.student_id = au.id
  LEFT JOIN class_group_memberships cgm
    ON cs.class_id = cgm.class_id
   AND cs.student_id = cgm.student_id
  LEFT JOIN class_groups cg
    ON cgm.group_id = cg.id
  WHERE cs.class_id = p_class_id
    AND cs.status = 'active'
  ORDER BY cs.joined_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_class_students_with_user_info(UUID) TO authenticated;

-- Student access: only allow access if enrollment is active
CREATE OR REPLACE FUNCTION public.is_student_in_group(
  p_class_id UUID,
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_students cs
    JOIN class_group_memberships cgm
      ON cs.class_id = cgm.class_id
     AND cs.student_id = cgm.student_id
    WHERE cs.class_id = p_class_id
      AND cs.student_id = auth.uid()
      AND cgm.group_id = p_group_id
      AND cs.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_student_in_group(UUID, UUID) TO authenticated;

-- Student profile: block updates if enrollment is not active
CREATE OR REPLACE FUNCTION public.upsert_student_class_info(
  p_class_id UUID,
  p_student_id UUID,
  p_field_responses JSONB
)
RETURNS student_class_info
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result student_class_info;
BEGIN
  -- Verify student is enrolled in the class (active only)
  IF NOT EXISTS (
    SELECT 1
    FROM class_students
    WHERE class_id = p_class_id
      AND student_id = p_student_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this class';
  END IF;

  -- Upsert the info
  INSERT INTO student_class_info (class_id, student_id, field_responses)
  VALUES (p_class_id, p_student_id, p_field_responses)
  ON CONFLICT (class_id, student_id)
  DO UPDATE SET
    field_responses = p_field_responses,
    updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Invite acceptance: block invites if enrollment exists (active or deleted)
CREATE OR REPLACE FUNCTION public.accept_student_invite(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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
  FROM class_student_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  -- Get the class public ID
  SELECT class_id INTO v_class_public_id FROM classes WHERE id = v_invite.class_id;

  -- If an enrollment exists, block re-joins and send them back to the instructor.
  IF EXISTS (
    SELECT 1
    FROM class_students
    WHERE class_id = v_invite.class_id
      AND student_id = auth.uid()
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are already enrolled in this class. Please reach out to the instructor.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM class_students
    WHERE class_id = v_invite.class_id
      AND student_id = auth.uid()
      AND status = 'deleted'
  ) THEN
    RAISE EXCEPTION 'You have been removed from this class. Please reach out to the instructor.';
  END IF;

  -- New member - insert into class_students
  -- The trigger trg_class_students_assign_group() will automatically assign to a group.
  INSERT INTO class_students (class_id, student_id)
  VALUES (v_invite.class_id, auth.uid());
  v_is_new_member := TRUE;

  -- Only increment uses for new members
  IF v_is_new_member THEN
    UPDATE class_student_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;

-- =====================================================
-- RLS: allow teachers/co-teachers to soft-delete
-- =====================================================

-- Existing policies only cover SELECT/INSERT. Add UPDATE so the frontend can
-- set status='deleted' + deleted_at.
CREATE POLICY "Teachers can update class_students enrollment status"
ON public.class_students
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.classes
    WHERE classes.id = class_students.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers
          WHERE class_teachers.class_id = classes.id
            AND class_teachers.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.classes
    WHERE classes.id = class_students.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers
          WHERE class_teachers.class_id = classes.id
            AND class_teachers.teacher_id = auth.uid()
        )
      )
  )
);

COMMIT;

