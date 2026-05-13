-- Fix: "SELECT FOR UPDATE not allowed in a non-volatile function"
--
-- `accept_student_invite` uses `FOR UPDATE` on `class_student_invites` and must
-- be VOLATILE (default). A prior migration incorrectly marked it STABLE.
--
-- Run this if you already applied `supabase_class_students_soft_delete_migration.sql`
-- before the STABLE lines were removed from that file.

BEGIN;

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
  IF NOT EXISTS (
    SELECT 1
    FROM class_students
    WHERE class_id = p_class_id
      AND student_id = p_student_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this class';
  END IF;

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

CREATE OR REPLACE FUNCTION public.accept_student_invite(p_token TEXT)
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
  FROM class_student_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  SELECT class_id INTO v_class_public_id FROM classes WHERE id = v_invite.class_id;

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

  INSERT INTO class_students (class_id, student_id)
  VALUES (v_invite.class_id, auth.uid());
  v_is_new_member := TRUE;

  IF v_is_new_member THEN
    UPDATE class_student_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;

COMMIT;
