-- Ensure browser clients (authenticated role) can invoke teacher-invite RPCs.
-- Some environments only ran early migrations; CREATE OR REPLACE does not add GRANTs.
-- Apply after supabase_class_teacher_roles_rbac.sql (or equivalent) defines these signatures.

GRANT EXECUTE ON FUNCTION public.create_teacher_invite(uuid, timestamp with time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_teacher_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teacher_invite(text) TO authenticated;
