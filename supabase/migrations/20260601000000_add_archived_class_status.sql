-- Add an 'archived' status for classes.
--
-- Archiving hides a class from the main teacher and student listings (which
-- filter on status = 'active') while keeping it fully recoverable, unlike the
-- irreversible 'deleted' soft-delete. Teachers restore archived classes from a
-- dedicated archived-classes page.

-- 1. Allow 'archived' in the classes status check constraint.
ALTER TABLE "public"."classes"
  DROP CONSTRAINT IF EXISTS "classes_status_check";

ALTER TABLE "public"."classes"
  ADD CONSTRAINT "classes_status_check"
  CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text", 'archived'::"text"])));

-- 2. Require full class control (or institution/super admin) to archive a
--    class, mirroring the existing delete restriction. Restoring an archived
--    class back to 'active' is gated in the UI and covered by the existing
--    "Class config managers update classes" UPDATE policy.
CREATE OR REPLACE FUNCTION "public"."guard_classes_immutable_and_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT public.is_platform_super_admin() THEN
      RAISE EXCEPTION 'classes.created_by is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('deleted', 'archived') THEN
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
