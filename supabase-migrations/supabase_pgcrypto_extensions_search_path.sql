-- On Supabase, CREATE EXTENSION pgcrypto often installs gen_random_bytes / digest
-- into schema "extensions". SECURITY DEFINER functions that use
-- SET search_path = public only then fail with:
--   function gen_random_bytes(integer) does not exist (42883)
-- Include "extensions" in search_path for every invite-related RPC that uses those calls.
--
-- If an ALTER fails with "function ... does not exist", that RPC is not deployed yet—
-- comment out or skip that line.

ALTER FUNCTION public.create_teacher_invite(uuid, timestamp with time zone, integer)
  SET search_path TO public, extensions;
ALTER FUNCTION public.accept_teacher_invite(text)
  SET search_path TO public, extensions;
ALTER FUNCTION public.create_student_invite(uuid, timestamp with time zone, integer)
  SET search_path TO public, extensions;
ALTER FUNCTION public.accept_student_invite(text)
  SET search_path TO public, extensions;
ALTER FUNCTION public.create_institution_admin_invite(uuid, timestamp with time zone, integer)
  SET search_path TO public, extensions;
ALTER FUNCTION public.accept_institution_admin_invite(text)
  SET search_path TO public, extensions;
