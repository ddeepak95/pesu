-- Institution-scoped member email lookup.
--
-- The existing `get_users_by_ids` RPC is super-admin-only because it can
-- resolve arbitrary `auth.users` rows. Institution admins need to see the
-- emails of admins on their own institution detail page, so this migration
-- adds a narrower RPC that:
--   * is gated by super-admin OR institution-admin of the target institution,
--   * only returns rows joined through `institution_members` for that
--     institution (no leakage of unrelated users).
--
-- Rollback:
--   drop function if exists public.get_institution_member_emails(uuid);

CREATE OR REPLACE FUNCTION public.get_institution_member_emails(p_institution_id uuid)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.is_platform_super_admin()
    OR public.is_institution_admin(p_institution_id)
  ) THEN
    RAISE EXCEPTION 'get_institution_member_emails: not authorized for institution %', p_institution_id;
  END IF;

  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
      JOIN public.institution_members im ON im.user_id = u.id
     WHERE im.institution_id = p_institution_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_institution_member_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_institution_member_emails(uuid) TO authenticated;
