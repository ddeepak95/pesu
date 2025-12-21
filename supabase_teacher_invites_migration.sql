-- Teacher invite links for adding co-teachers (owner-only)
-- Creates:
-- - class_teacher_invites table
-- - create_teacher_invite() function (owner-only)
-- - revoke_teacher_invite() function (owner-only)
-- - accept_teacher_invite() function (authenticated, via token)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS class_teacher_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  -- Single reusable invite link per class. When max_uses is NULL, uses are unlimited.
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure max_uses allows NULL (for unlimited uses)
ALTER TABLE class_teacher_invites ALTER COLUMN max_uses DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_teacher_invites_class_id
  ON class_teacher_invites(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teacher_invites_token_hash
  ON class_teacher_invites(token_hash);

-- Enforce one invite row per class (single link)
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_teacher_invites_unique_class_id
  ON class_teacher_invites(class_id);

ALTER TABLE class_teacher_invites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Owner can view teacher invites" ON class_teacher_invites;
DROP POLICY IF EXISTS "Owner can create teacher invites" ON class_teacher_invites;
DROP POLICY IF EXISTS "Owner can update teacher invites" ON class_teacher_invites;

-- Owner can read/manage invites for their class
CREATE POLICY "Owner can view teacher invites" ON class_teacher_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_teacher_invites.class_id
      AND classes.created_by = auth.uid()
    )
  );

CREATE POLICY "Owner can create teacher invites" ON class_teacher_invites
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_teacher_invites.class_id
      AND classes.created_by = auth.uid()
    )
  );

CREATE POLICY "Owner can update teacher invites" ON class_teacher_invites
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_teacher_invites.class_id
      AND classes.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_teacher_invites.class_id
      AND classes.created_by = auth.uid()
    )
  );

-- updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_class_teacher_invites_updated_at ON class_teacher_invites;
CREATE TRIGGER update_class_teacher_invites_updated_at
  BEFORE UPDATE ON class_teacher_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- SECURITY DEFINER functions are created by postgres in Supabase SQL editor and will bypass RLS.

CREATE OR REPLACE FUNCTION create_teacher_invite(
  p_class_id UUID,
  -- Default: 100 years from now (effectively never expires until revoked)
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '100 years'),
  -- Pass NULL for unlimited uses (default).
  p_max_uses INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner UUID;
  v_token TEXT;
  v_hash TEXT;
BEGIN
  SELECT created_by INTO v_owner FROM classes WHERE id = p_class_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can create teacher invites';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Single invite per class: overwrite existing invite (regenerate link).
  INSERT INTO class_teacher_invites (class_id, token_hash, created_by, expires_at, max_uses, uses, revoked_at)
  VALUES (p_class_id, v_hash, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (class_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_teacher_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id UUID;
  v_owner UUID;
BEGIN
  SELECT class_id INTO v_class_id FROM class_teacher_invites WHERE id = p_invite_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  SELECT created_by INTO v_owner FROM classes WHERE id = v_class_id;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can revoke teacher invites';
  END IF;

  UPDATE class_teacher_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;

-- Accept an invite token and join the class as co-teacher.
-- Returns the class public id (classes.class_id) for redirecting.
-- If already a member, still returns the class id (allows re-using link).
CREATE OR REPLACE FUNCTION accept_teacher_invite(p_token TEXT)
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
  FROM class_teacher_invites
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

  -- Check if user is already the owner - just return the class (no error)
  IF EXISTS (SELECT 1 FROM classes WHERE id = v_invite.class_id AND created_by = auth.uid()) THEN
    RETURN v_class_public_id;
  END IF;

  -- Check if already a co-teacher - just return the class (no error)
  IF EXISTS (
    SELECT 1 FROM class_teachers
    WHERE class_teachers.class_id = v_invite.class_id
      AND class_teachers.teacher_id = auth.uid()
  ) THEN
    RETURN v_class_public_id;
  END IF;

  -- New member - insert into class_teachers
  INSERT INTO class_teachers (class_id, teacher_id, role)
  VALUES (v_invite.class_id, auth.uid(), 'co-teacher');
  v_is_new_member := TRUE;

  -- Only increment uses for new members
  IF v_is_new_member THEN
    UPDATE class_teacher_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;


