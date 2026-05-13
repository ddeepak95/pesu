-- Institution admin invite links.
--
-- Mirrors `class_teacher_invites` but scoped to institutions and with a
-- broader permission set: super admins OR existing institution admins of
-- the same institution can mint/revoke the link. Accepting the link joins
-- the caller into `institution_members` with role='admin'.
--
-- Creates:
--   * public.institution_admin_invites table (one row per institution).
--   * public.create_institution_admin_invite RPC (SECURITY DEFINER).
--   * public.revoke_institution_admin_invite RPC (SECURITY DEFINER).
--   * public.accept_institution_admin_invite RPC (SECURITY DEFINER).
--
-- Rollback:
--   drop function if exists public.accept_institution_admin_invite(text);
--   drop function if exists public.revoke_institution_admin_invite(uuid);
--   drop function if exists public.create_institution_admin_invite(uuid, timestamptz, integer);
--   drop table if exists public.institution_admin_invites;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.institution_admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL
    REFERENCES public.institutions(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  -- Plaintext token kept alongside the hash so admins can re-copy the link.
  -- Only readable to super admins / institution admins via RLS.
  token TEXT,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  -- NULL = unlimited uses (default).
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_institution_admin_invites_institution_id
  ON public.institution_admin_invites(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_admin_invites_token_hash
  ON public.institution_admin_invites(token_hash);

-- Single active invite row per institution (upsert keeps regenerate flow simple).
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_admin_invites_unique_institution_id
  ON public.institution_admin_invites(institution_id);

ALTER TABLE public.institution_admin_invites ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. RLS policies
-- =====================================================================

DROP POLICY IF EXISTS "Admins read institution admin invites" ON public.institution_admin_invites;
DROP POLICY IF EXISTS "Admins manage institution admin invites" ON public.institution_admin_invites;

CREATE POLICY "Admins read institution admin invites"
  ON public.institution_admin_invites FOR SELECT
  USING (
    public.is_platform_super_admin()
    OR public.is_institution_admin(institution_id)
  );

CREATE POLICY "Admins manage institution admin invites"
  ON public.institution_admin_invites FOR ALL
  USING (
    public.is_platform_super_admin()
    OR public.is_institution_admin(institution_id)
  )
  WITH CHECK (
    public.is_platform_super_admin()
    OR public.is_institution_admin(institution_id)
  );

-- =====================================================================
-- 3. updated_at trigger
-- =====================================================================

-- update_updated_at_column() already exists from the teacher invites
-- migration; we just bind a fresh trigger to this table.
DROP TRIGGER IF EXISTS update_institution_admin_invites_updated_at
  ON public.institution_admin_invites;
CREATE TRIGGER update_institution_admin_invites_updated_at
  BEFORE UPDATE ON public.institution_admin_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4. create_institution_admin_invite RPC
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_institution_admin_invite(
  p_institution_id UUID,
  -- Default: 100 years from now (effectively never expires until revoked).
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '100 years'),
  -- NULL = unlimited uses.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_institution_admin_invite: no authenticated user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_institution_id) THEN
    RAISE EXCEPTION 'create_institution_admin_invite: institution % does not exist', p_institution_id;
  END IF;

  IF NOT (public.is_platform_super_admin() OR public.is_institution_admin(p_institution_id)) THEN
    RAISE EXCEPTION 'create_institution_admin_invite: caller is not authorized for institution %', p_institution_id;
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Single invite per institution: upsert regenerates the link.
  INSERT INTO public.institution_admin_invites (
    institution_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at
  )
  VALUES (p_institution_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (institution_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    token = EXCLUDED.token,
    created_by = EXCLUDED.created_by,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_institution_admin_invite(uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_institution_admin_invite(uuid, timestamptz, integer) TO authenticated;

-- =====================================================================
-- 5. revoke_institution_admin_invite RPC
-- =====================================================================

CREATE OR REPLACE FUNCTION public.revoke_institution_admin_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_institution_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'revoke_institution_admin_invite: no authenticated user';
  END IF;

  SELECT institution_id INTO v_institution_id
  FROM public.institution_admin_invites
  WHERE id = p_invite_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'revoke_institution_admin_invite: invite % not found', p_invite_id;
  END IF;

  IF NOT (public.is_platform_super_admin() OR public.is_institution_admin(v_institution_id)) THEN
    RAISE EXCEPTION 'revoke_institution_admin_invite: caller is not authorized';
  END IF;

  UPDATE public.institution_admin_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_institution_admin_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_institution_admin_invite(uuid) TO authenticated;

-- =====================================================================
-- 6. accept_institution_admin_invite RPC
-- =====================================================================
--
-- Returns the institution UUID so the caller can redirect to the
-- institution detail page. Idempotent: re-accepting as an existing admin
-- just returns the id without inserting or incrementing `uses`.

CREATE OR REPLACE FUNCTION public.accept_institution_admin_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_is_new_member BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'accept_institution_admin_invite: must be authenticated';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM public.institution_admin_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_institution_admin_invite: invite invalid or expired';
  END IF;

  -- Already a member? Idempotent: return the institution id and exit.
  IF EXISTS (
    SELECT 1
    FROM public.institution_members
    WHERE institution_id = v_invite.institution_id
      AND user_id = auth.uid()
  ) THEN
    RETURN v_invite.institution_id;
  END IF;

  INSERT INTO public.institution_members (institution_id, user_id, role)
  VALUES (v_invite.institution_id, auth.uid(), 'admin');
  v_is_new_member := TRUE;

  IF v_is_new_member THEN
    UPDATE public.institution_admin_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_invite.institution_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_institution_admin_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_institution_admin_invite(text) TO authenticated;
