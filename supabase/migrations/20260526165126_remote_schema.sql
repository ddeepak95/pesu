


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."ai_config_scope" AS ENUM (
    'platform',
    'institution',
    'class'
);


ALTER TYPE "public"."ai_config_scope" OWNER TO "postgres";


CREATE TYPE "public"."setting_scope" AS ENUM (
    'institution',
    'class'
);


ALTER TYPE "public"."setting_scope" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_student_invite"("p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."accept_student_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_teacher_invite"("p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."accept_teacher_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_catalog_enforce_institution_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_institution_id              uuid;
  v_allow_override              boolean;
  v_allow_platform_defaults     boolean;
BEGIN
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.scope = 'institution' AND NEW.use_platform_default = true THEN
    SELECT s.allow_use_platform_defaults INTO v_allow_platform_defaults
      FROM public.ai_institution_settings s
      WHERE s.institution_id = NEW.scope_id;

    IF v_allow_platform_defaults IS NOT NULL AND v_allow_platform_defaults = false THEN
      RAISE EXCEPTION 'Institution may not use platform AI defaults for this institution';
    END IF;
  END IF;

  IF NEW.scope = 'class' THEN
    SELECT c.institution_id INTO v_institution_id
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_institution_id IS NOT NULL THEN
      IF TG_TABLE_NAME = 'ai_provider_activations'
         AND NEW.use_platform_default = false
         AND NEW.is_active = true THEN
        SELECT s.allow_child_override INTO v_allow_override
          FROM public.ai_institution_settings s
          WHERE s.institution_id = v_institution_id;

        IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
          RAISE EXCEPTION 'Class AI override is disabled by the institution';
        END IF;
      END IF;

      IF TG_TABLE_NAME = 'ai_function_bindings' THEN
        SELECT s.allow_child_override INTO v_allow_override
          FROM public.ai_institution_settings s
          WHERE s.institution_id = v_institution_id;

        IF v_allow_override IS NOT NULL AND v_allow_override = false THEN
          RAISE EXCEPTION 'Class AI override is disabled by the institution';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ai_catalog_enforce_institution_policy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit';
    END IF;
    IF NEW.allow_use_platform_defaults IS DISTINCT FROM OLD.allow_use_platform_defaults THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_use_platform_defaults';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_student_to_group"("p_class_id" "uuid", "p_student_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_group_id UUID;
  v_strategy TEXT;
BEGIN
  -- Ensure groups exist
  PERFORM ensure_class_groups(p_class_id);

  -- Read the assignment strategy for this class
  SELECT student_assignment_strategy INTO v_strategy
  FROM classes
  WHERE id = p_class_id;

  IF v_strategy = 'default_group' THEN
    -- Assign to the first group (group_index = 0)
    SELECT g.id INTO v_group_id
    FROM class_groups g
    WHERE g.class_id = p_class_id AND g.group_index = 0
    LIMIT 1;
  ELSE
    -- Round-robin: pick group with lowest membership count, then lowest index
    SELECT g.id
    INTO v_group_id
    FROM class_groups g
    LEFT JOIN class_group_memberships m
      ON m.group_id = g.id
    WHERE g.class_id = p_class_id
    GROUP BY g.id, g.group_index
    ORDER BY COUNT(m.id) ASC, g.group_index ASC
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No groups available for class';
  END IF;

  INSERT INTO class_group_memberships (class_id, group_id, student_id)
  VALUES (p_class_id, v_group_id, p_student_id)
  ON CONFLICT (class_id, student_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."assign_student_to_group"("p_class_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_configure_class"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.has_full_class_control(p_class_id)
    OR public.is_class_teacher_admin(p_class_id)
    OR public.is_platform_super_admin()
    OR public.is_class_institution_admin(p_class_id);
$$;


ALTER FUNCTION "public"."can_configure_class"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.can_configure_class(p_class_id);
$$;


ALTER FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.has_full_class_control(p_class_id)
    OR public.is_platform_super_admin()
    OR public.is_class_institution_admin(p_class_id);
$$;


ALTER FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."class_teachers_enforce_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."class_teachers_enforce_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."class_teachers_prevent_owner_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.role = 'owner'
     AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = OLD.class_id) THEN
    RAISE EXCEPTION 'Cannot remove the primary owner; archive or delete the class instead';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."class_teachers_prevent_owner_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_setting_values_for_class"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.setting_values
    WHERE scope = 'class' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cleanup_setting_values_for_class"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_setting_values_for_institution"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.setting_values
    WHERE scope = 'institution' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cleanup_setting_values_for_institution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."content_items_validate_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.type = 'quiz' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = NEW.ref_id AND q.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: quiz ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'learning_content' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.learning_contents lc
      WHERE lc.id = NEW.ref_id AND lc.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: learning_content ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'formative_assignment' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = NEW.ref_id AND a.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: formative_assignment ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'survey' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = NEW.ref_id AND s.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: survey ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'content_items: unknown type %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."content_items_validate_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT ("timezone"('utc'::"text", "now"()) + '100 years'::interval), "p_max_uses" integer DEFAULT NULL::integer) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_student_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT ("timezone"('utc'::"text", "now"()) + '100 years'::interval), "p_max_uses" integer DEFAULT NULL::integer) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."create_student_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT ("timezone"('utc'::"text", "now"()) + '100 years'::interval), "p_max_uses" integer DEFAULT NULL::integer) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_institution_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.institutions WHERE is_default = true LIMIT 1;
$$;


ALTER FUNCTION "public"."default_institution_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_class_groups"("p_class_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_group_count INTEGER;
  i INTEGER;
BEGIN
  SELECT group_count INTO v_group_count FROM classes WHERE id = p_class_id;
  IF v_group_count IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  FOR i IN 0..(v_group_count - 1) LOOP
    INSERT INTO class_groups (class_id, group_index, name)
    VALUES (p_class_id, i, 'Group ' || (i + 1))
    ON CONFLICT (class_id, group_index) DO NOTHING;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."ensure_class_groups"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'find_user_id_by_email: caller is not a platform super admin';
  END IF;

  SELECT id INTO v_id
    FROM auth.users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."find_user_id_by_email"("p_email" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."class_mandatory_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_type" "text" NOT NULL,
    "options" "jsonb",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_mandatory" boolean DEFAULT true NOT NULL,
    "is_display_name" boolean DEFAULT false NOT NULL,
    CONSTRAINT "class_mandatory_fields_field_type_check" CHECK (("field_type" = ANY (ARRAY['text'::"text", 'dropdown'::"text", 'number'::"text", 'phone'::"text"])))
);


ALTER TABLE "public"."class_mandatory_fields" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_mandatory_fields"("p_class_id" "uuid") RETURNS SETOF "public"."class_mandatory_fields"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT * FROM class_mandatory_fields
  WHERE class_id = p_class_id
  ORDER BY position ASC, created_at ASC;
$$;


ALTER FUNCTION "public"."get_class_mandatory_fields"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") RETURNS TABLE("student_id" "uuid", "total" bigint, "completed" bigint, "last_completed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM classes c
    WHERE c.id = p_class_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM class_teachers ct
          WHERE ct.class_id = c.id
            AND ct.teacher_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH active_students AS (
    SELECT
      cs.student_id,
      cgm.group_id AS student_group_id
    FROM class_students cs
    LEFT JOIN class_group_memberships cgm
      ON cgm.class_id = cs.class_id
     AND cgm.student_id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND cs.status = 'active'
  ),
  scoped_content AS (
    SELECT ci.id AS content_item_id,
           ci.class_group_id
    FROM content_items ci
    WHERE ci.class_id = p_class_id
      AND ci.status IN ('active', 'draft')
  ),
  student_scope AS (
    SELECT s.student_id,
           sc.content_item_id
    FROM active_students s
    CROSS JOIN scoped_content sc
    WHERE (s.student_group_id IS NULL AND sc.class_group_id IS NULL)
       OR (s.student_group_id IS NOT NULL AND sc.class_group_id = s.student_group_id)
  ),
  completions AS (
    SELECT scc.student_id,
           scc.content_item_id,
           scc.completed_at
    FROM student_content_completions scc
    INNER JOIN scoped_content sc ON sc.content_item_id = scc.content_item_id
    INNER JOIN active_students ast ON ast.student_id = scc.student_id
  )
  SELECT
    ast.student_id,
    COUNT(ss.content_item_id)::bigint AS total,
    COUNT(c.completed_at)::bigint AS completed,
    MAX(c.completed_at) AS last_completed_at
  FROM active_students ast
  LEFT JOIN student_scope ss ON ss.student_id = ast.student_id
  LEFT JOIN completions c
    ON c.student_id = ss.student_id
   AND c.content_item_id = ss.content_item_id
  GROUP BY ast.student_id;
END;
$$;


ALTER FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") IS 'Teacher/co-teacher: per enrolled student, counts of group-scoped content items and completions plus max(completed_at).';



CREATE OR REPLACE FUNCTION "public"."get_class_students_with_user_info"("p_class_id" "uuid") RETURNS TABLE("student_id" "uuid", "joined_at" timestamp with time zone, "student_email" "text", "student_display_name" "text", "group_id" "uuid", "group_name" "text", "group_index" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."get_class_students_with_user_info"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_teachers_with_user_info"("p_class_id" "uuid") RETURNS TABLE("id" "uuid", "class_id" "uuid", "teacher_id" "uuid", "role" "text", "joined_at" timestamp with time zone, "teacher_email" "text", "teacher_display_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_class_teachers_with_user_info"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") RETURNS TABLE("id" "uuid", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_class_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "field_responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."student_class_info" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid") RETURNS "public"."student_class_info"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT * FROM student_class_info
  WHERE class_id = p_class_id AND student_id = p_student_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'get_users_by_ids: caller is not a platform super admin';
  END IF;

  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
      WHERE u.id = ANY(p_ids);
END;
$$;


ALTER FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) OWNER TO "postgres";


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


ALTER FUNCTION "public"."guard_classes_immutable_and_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_classes_institution_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
     AND NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Only platform super admins may change classes.institution_id; use move_class_to_institution()';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_classes_institution_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_completed_mandatory_info"("p_class_id" "uuid", "p_student_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_field_count INTEGER;
  v_response_count INTEGER;
  v_field_ids UUID[];
  v_responses JSONB;
BEGIN
  -- Get only mandatory field IDs for the class
  SELECT array_agg(id) INTO v_field_ids
  FROM class_mandatory_fields
  WHERE class_id = p_class_id AND is_mandatory = TRUE;

  -- If no mandatory fields, return true
  IF v_field_ids IS NULL OR array_length(v_field_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  v_field_count := array_length(v_field_ids, 1);

  -- Get student's responses
  SELECT field_responses INTO v_responses
  FROM student_class_info
  WHERE class_id = p_class_id AND student_id = p_student_id;

  -- If no response record exists, return false
  IF v_responses IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Count how many mandatory fields have non-empty responses
  SELECT COUNT(*) INTO v_response_count
  FROM unnest(v_field_ids) AS field_id
  WHERE v_responses->>field_id::text IS NOT NULL 
    AND v_responses->>field_id::text <> '';

  -- Return true if all mandatory fields have responses
  RETURN v_response_count >= v_field_count;
END;
$$;


ALTER FUNCTION "public"."has_completed_mandatory_info"("p_class_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = ANY (ARRAY['owner'::text, 'co-owner'::text])
  );
$$;


ALTER FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'co-owner'
  );
$$;


ALTER FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_co_teacher"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_teachers 
    WHERE class_id = p_class_id 
    AND teacher_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_class_co_teacher"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_institution_admin"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id
      AND public.is_institution_admin(c.institution_id)
  );
$$;


ALTER FUNCTION "public"."is_class_institution_admin"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_owner"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_class_owner"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_student"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students 
    WHERE class_id = p_class_id 
    AND student_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_class_student"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
      AND ct.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_default_institution"("p_institution_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(is_default, false)
    FROM public.institutions
    WHERE id = p_institution_id;
$$;


ALTER FUNCTION "public"."is_default_institution"("p_institution_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_institution_admin"("p_institution_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institution_members
    WHERE institution_id = p_institution_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_institution_admin"("p_institution_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_super_admins WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_platform_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_student_in_group"("p_class_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."is_student_in_group"("p_class_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_from uuid;
  v_audit_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'move_class_to_institution: no authenticated user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_super_admins WHERE user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'move_class_to_institution: caller is not a platform super admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institutions WHERE id = p_target_institution_id
  ) THEN
    RAISE EXCEPTION
      'move_class_to_institution: target institution % does not exist',
      p_target_institution_id;
  END IF;

  SELECT institution_id INTO v_from
    FROM public.classes
    WHERE id = p_class_id;

  IF v_from IS NULL THEN
    RAISE EXCEPTION
      'move_class_to_institution: class % not found or has no institution_id',
      p_class_id;
  END IF;

  IF v_from = p_target_institution_id THEN
    -- Already there; treat as no-op so callers can retry safely.
    RETURN NULL;
  END IF;

  UPDATE public.classes
    SET institution_id = p_target_institution_id,
        updated_at = now()
    WHERE id = p_class_id;

  INSERT INTO public.class_institution_moves
    (class_id, from_institution_id, to_institution_id, moved_by, reason)
  VALUES
    (p_class_id, v_from, p_target_institution_id, v_caller, p_reason)
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;


ALTER FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconfigure_class_groups"("p_class_id" "uuid", "p_new_group_count" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."reconfigure_class_groups"("p_class_id" "uuid", "p_new_group_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_student_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."revoke_student_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_teacher_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."revoke_teacher_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_class_default_institution"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    NEW.institution_id := public.default_institution_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_class_default_institution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setting_values_enforce_locks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_parent_allow_override boolean;
  v_class_institution     uuid;
BEGIN
  -- Super admin can do anything.
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- allow_admin_edit may only change by a super admin (handled above).
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit on setting_values';
    END IF;

    -- When the admin-edit lock is engaged, only super admins may change value.
    IF NEW.scope = 'institution'
       AND OLD.allow_admin_edit = false
       AND NEW.value IS DISTINCT FROM OLD.value THEN
      RAISE EXCEPTION 'Institution setting is locked by platform; value cannot be changed';
    END IF;
  END IF;

  -- Class-scoped writes additionally require the parent institution to allow
  -- child override (lookup the parent setting row if it exists).
  IF NEW.scope = 'class' THEN
    SELECT c.institution_id INTO v_class_institution
      FROM public.classes c
      WHERE c.id = NEW.scope_id;

    IF v_class_institution IS NOT NULL THEN
      SELECT sv.allow_child_override INTO v_parent_allow_override
        FROM public.setting_values sv
        WHERE sv.scope = 'institution'
          AND sv.scope_id = v_class_institution
          AND sv.key = NEW.key;

      -- If no parent row exists, the institution is using the platform default
      -- and class override is allowed (registry default).
      IF v_parent_allow_override IS NOT NULL AND v_parent_allow_override = false THEN
        RAISE EXCEPTION 'Class override is disabled by the institution for key %', NEW.key;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."setting_values_enforce_locks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text" DEFAULT 'co-owner'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_class_students_assign_group"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM assign_student_to_group(NEW.class_id, NEW.student_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_class_students_assign_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_classes_after_insert_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.class_teachers (class_id, teacher_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (class_id, teacher_id)
  DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_classes_after_insert_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_classes_ensure_groups"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM ensure_class_groups(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_classes_ensure_groups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_activity_logs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_activity_logs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid", "p_field_responses" "jsonb") RETURNS "public"."student_class_info"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."upsert_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid", "p_field_responses" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_institution_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT institution_id
    FROM public.institution_members
    WHERE user_id = auth.uid() AND role = 'admin';
$$;


ALTER FUNCTION "public"."user_institution_ids"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "submission_id" "text",
    "class_id" "uuid",
    "component_type" "text" NOT NULL,
    "component_id" "text" NOT NULL,
    "sub_component_id" "text",
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "event_id" "uuid",
    "client_ts" timestamp with time zone,
    "interaction_source" "text"
);


ALTER TABLE "public"."activity_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_events" IS 'INSERT-only event log for tracking attempt start/end timestamps';



COMMENT ON COLUMN "public"."activity_events"."event_type" IS 'Semantic event type. Current allowed values: attempt_started, attempt_ended, bot_connect_initiated, bot_disconnected, class_opened, class_closed, content_item_opened, component_closed, navigation_back_clicked, navigation_close_clicked, navigation_next_item_clicked, feedback_view_clicked, finish_mark_complete_clicked, submit_clicked, question_next_clicked, question_previous_clicked, upload_started, upload_completed, marked_complete_clicked.';



COMMENT ON COLUMN "public"."activity_events"."event_id" IS 'Client-generated UUID for idempotent ingestion. Unique when present.';



COMMENT ON COLUMN "public"."activity_events"."client_ts" IS 'Device time at emit (ISO 8601 UTC) for latency analysis; compatible with created_at arithmetic. Order by created_at instead.';



COMMENT ON COLUMN "public"."activity_events"."interaction_source" IS 'Source classifier for event trigger semantics: click, lifecycle, async_callback, or system.';



CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "submission_id" "text",
    "class_id" "uuid",
    "component_type" "text" NOT NULL,
    "component_id" "text" NOT NULL,
    "sub_component_id" "text",
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_logs" IS 'Periodic time tracking - upserts every 10 seconds while student is active';



COMMENT ON COLUMN "public"."activity_logs"."session_id" IS 'Stable ID: browser_session + component_type + component_id + sub_component_id';



COMMENT ON COLUMN "public"."activity_logs"."total_time_ms" IS 'Cumulative time spent on this component in milliseconds';



CREATE TABLE IF NOT EXISTS "public"."ai_function_bindings" (
    "scope" "public"."ai_config_scope" NOT NULL,
    "scope_id" "uuid" NOT NULL,
    "binding_key" "text" NOT NULL,
    "provider_id" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "reasoning_json" "jsonb",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_function_bindings_provider_check" CHECK (("provider_id" = ANY (ARRAY['google'::"text", 'openai'::"text"]))),
    CONSTRAINT "ai_function_bindings_scope_check" CHECK (("scope" = ANY (ARRAY['platform'::"public"."ai_config_scope", 'institution'::"public"."ai_config_scope", 'class'::"public"."ai_config_scope"])))
);


ALTER TABLE "public"."ai_function_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_institution_settings" (
    "institution_id" "uuid" NOT NULL,
    "allow_admin_edit" boolean DEFAULT false NOT NULL,
    "allow_child_override" boolean DEFAULT false NOT NULL,
    "allow_use_platform_defaults" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_institution_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_invocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_function_key" "text" NOT NULL,
    "ai_provider" "text",
    "ai_model_id" "text",
    "ai_key_source" "text",
    "class_id" "uuid",
    "assignment_id" "text",
    "submission_id" "text",
    "question_order" integer,
    "attempt_number" integer,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "request_storage_path" "text" NOT NULL,
    "response_storage_path" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "retry_of" "uuid",
    "retry_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_invocations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_invocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_provider_activations" (
    "scope" "public"."ai_config_scope" NOT NULL,
    "scope_id" "uuid" NOT NULL,
    "provider_id" "text" NOT NULL,
    "use_platform_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "encrypted_api_key" "text",
    "key_hint" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_provider_activations_provider_check" CHECK (("provider_id" = ANY (ARRAY['google'::"text", 'openai'::"text"]))),
    CONSTRAINT "ai_provider_activations_scope_check" CHECK (("scope" = ANY (ARRAY['platform'::"public"."ai_config_scope", 'institution'::"public"."ai_config_scope", 'class'::"public"."ai_config_scope"])))
);


ALTER TABLE "public"."ai_provider_activations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approved_teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "approved_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approved_teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "total_points" integer NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "assessment_mode" "text" DEFAULT 'voice'::"text" NOT NULL,
    "class_group_id" "uuid",
    "responder_fields_config" "jsonb",
    "max_attempts" integer DEFAULT 1,
    "bot_prompt_config" "jsonb",
    "lock_language" boolean DEFAULT false NOT NULL,
    "use_star_display" boolean DEFAULT false NOT NULL,
    "star_scale" integer DEFAULT 5,
    "teacher_view_stars" boolean DEFAULT false NOT NULL,
    "require_all_attempts" boolean DEFAULT false NOT NULL,
    "student_instructions" "text",
    "show_rubric" boolean DEFAULT true NOT NULL,
    "show_rubric_points" boolean DEFAULT true NOT NULL,
    "shared_context_enabled" boolean DEFAULT false NOT NULL,
    "shared_context" "text",
    "evaluation_prompt" "text",
    "experience_rating_enabled" boolean DEFAULT false NOT NULL,
    "experience_rating_required" boolean DEFAULT false NOT NULL,
    "feedback_requires_approval" boolean DEFAULT false,
    "allow_copy_paste" boolean DEFAULT false NOT NULL,
    "tab_switch_policy" "text" DEFAULT 'warn'::"text" NOT NULL,
    "tab_switch_max_leaves" integer,
    "activity_type" "text" DEFAULT 'learning'::"text" NOT NULL,
    "file_submission_config" "jsonb",
    "dynamic_questions_enabled" boolean DEFAULT false NOT NULL,
    "dynamic_question_focuses" "jsonb",
    "dynamic_generation_prompt" "text",
    CONSTRAINT "assignments_assessment_mode_check" CHECK (("assessment_mode" = ANY (ARRAY['voice'::"text", 'text_chat'::"text", 'static_text'::"text"]))),
    CONSTRAINT "assignments_max_attempts_check" CHECK (("max_attempts" >= 1)),
    CONSTRAINT "assignments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'deleted'::"text"]))),
    CONSTRAINT "assignments_tab_switch_policy_check" CHECK (("tab_switch_policy" = ANY (ARRAY['allow'::"text", 'warn'::"text", 'block_after_threshold'::"text"]))),
    CONSTRAINT "assignments_total_points_check" CHECK (("total_points" > 0))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assignments"."questions" IS 'Array of question objects, each containing: order, prompt, total_points, rubric (array), and supporting_content';



COMMENT ON COLUMN "public"."assignments"."preferred_language" IS 'Preferred language for the assignment (e.g., "en", "ta", "de"). Defaults to the class preferred_language. Should match language codes from supportedLanguages.ts';



COMMENT ON COLUMN "public"."assignments"."is_public" IS 'Whether the assignment is publicly accessible via link (no authentication required)';



COMMENT ON COLUMN "public"."assignments"."responder_fields_config" IS 'Configuration for responder details collection in public assignments. Array of field definitions: {field: string, type: "text"|"email"|"tel"|"select", label: string, required: boolean, placeholder?: string, options?: string[]}';



COMMENT ON COLUMN "public"."assignments"."max_attempts" IS 'Maximum number of attempts allowed per student for this assignment. Defaults to 1 (single attempt).';



COMMENT ON COLUMN "public"."assignments"."bot_prompt_config" IS 'Configuration for AI bot behavior (voice and chat modes). Structure: {
  system_prompt: string (with variable placeholders like {{language}}, {{question_prompt}}, {{rubric}}),
  conversation_start: { first_question: string, subsequent_questions: string },
  question_overrides: { [questionOrder]: { system_prompt?, conversation_start? } }
}';



COMMENT ON COLUMN "public"."assignments"."lock_language" IS 'When true, students cannot change the interaction language during the assessment. The language is fixed to preferred_language.';



COMMENT ON COLUMN "public"."assignments"."use_star_display" IS 'Whether to show star ratings instead of points to students. Defaults to false.';



COMMENT ON COLUMN "public"."assignments"."star_scale" IS 'Number of stars in the rating scale (e.g., 5, 10, 20). Only applies when use_star_display is true. Defaults to 5.';



COMMENT ON COLUMN "public"."assignments"."teacher_view_stars" IS 'Whether the teacher views stars or points in their submissions view. Defaults to false (points).';



COMMENT ON COLUMN "public"."assignments"."require_all_attempts" IS 'When true, students must attempt all questions before they can mark the assessment as complete.';



COMMENT ON COLUMN "public"."assignments"."student_instructions" IS 'Display-only instructions shown to students before they start the assessment. Not passed to the AI prompt.';



COMMENT ON COLUMN "public"."assignments"."show_rubric" IS 'Whether to show the rubric to students during the assessment. Defaults to true.';



COMMENT ON COLUMN "public"."assignments"."show_rubric_points" IS 'Whether to show rubric point values to students. Only applies when show_rubric is true. Defaults to true.';



COMMENT ON COLUMN "public"."assignments"."shared_context_enabled" IS 'When true, a shared context is shown to students and included in all AI prompts. Defaults to false.';



COMMENT ON COLUMN "public"."assignments"."shared_context" IS 'The shared context text (e.g. a case study, passage, scenario). Only used when shared_context_enabled is true.';



COMMENT ON COLUMN "public"."assignments"."evaluation_prompt" IS 'Custom evaluation prompt template. If set, replaces the hardcoded evaluation prompt. Supports placeholders: {{language}}, {{question_prompt}}, {{rubric}}, {{answer_text}}, {{shared_context}}.';



COMMENT ON COLUMN "public"."assignments"."experience_rating_enabled" IS 'When true, students are asked to rate their experience when completing the assessment';



COMMENT ON COLUMN "public"."assignments"."experience_rating_required" IS 'When true, students must provide a rating before completing (otherwise they can skip)';



COMMENT ON COLUMN "public"."assignments"."allow_copy_paste" IS 'When false, answer textareas block paste and clipboard shortcuts.';



COMMENT ON COLUMN "public"."assignments"."tab_switch_policy" IS 'allow: log only; warn: modal on return; block_after_threshold: lock after N leaves.';



COMMENT ON COLUMN "public"."assignments"."tab_switch_max_leaves" IS 'Required when tab_switch_policy = block_after_threshold; max hidden-tab events before lock.';



COMMENT ON COLUMN "public"."assignments"."file_submission_config" IS 'JSONB config for file submission: { required: bool, allow_multiple: bool, instructions?: string, allowed_file_types?: string[] }';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text",
    "assignment_id" "text" NOT NULL,
    "question_order" integer NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "attempt_number" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_key_source" "text",
    "ai_provider" "text",
    "ai_model_id" "text",
    "ai_invocation_id" "uuid",
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_group_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."class_group_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "group_index" integer NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "class_groups_group_index_check" CHECK (("group_index" >= 0))
);


ALTER TABLE "public"."class_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_institution_moves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "from_institution_id" "uuid" NOT NULL,
    "to_institution_id" "uuid" NOT NULL,
    "moved_by" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."class_institution_moves" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_student_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "token" "text",
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "max_uses" integer,
    "uses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "class_student_invites_uses_check" CHECK (("uses" >= 0))
);


ALTER TABLE "public"."class_student_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "class_students_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."class_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_teacher_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "max_uses" integer DEFAULT 1,
    "uses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "token" "text",
    CONSTRAINT "class_teacher_invites_max_uses_check" CHECK (("max_uses" >= 1)),
    CONSTRAINT "class_teacher_invites_uses_check" CHECK (("uses" >= 0))
);


ALTER TABLE "public"."class_teacher_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "class_teachers_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'co-owner'::"text", 'admin'::"text", 'co-teacher'::"text"])))
);


ALTER TABLE "public"."class_teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "class_id" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "group_count" integer DEFAULT 1 NOT NULL,
    "enable_progressive_unlock" boolean DEFAULT false NOT NULL,
    "student_assignment_strategy" "text" DEFAULT 'round_robin'::"text" NOT NULL,
    "progress_view_config" "jsonb",
    "institution_id" "uuid",
    CONSTRAINT "chk_student_assignment_strategy" CHECK (("student_assignment_strategy" = ANY (ARRAY['round_robin'::"text", 'default_group'::"text"]))),
    CONSTRAINT "classes_group_count_check" CHECK (("group_count" >= 1)),
    CONSTRAINT "classes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."classes"."preferred_language" IS 'Preferred language for the class (e.g., "en", "ta", "de"). Should match language codes from supportedLanguages.ts';



COMMENT ON COLUMN "public"."classes"."enable_progressive_unlock" IS 'When true, students can only access content items sequentially. The first item is unlocked by default, and subsequent items unlock when the previous item is marked complete.';



COMMENT ON COLUMN "public"."classes"."student_assignment_strategy" IS 'How new students are assigned to groups: round_robin (balanced distribution) or default_group (all go to Group 1)';



CREATE TABLE IF NOT EXISTS "public"."content_item_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "group_key" "text" NOT NULL,
    "position" integer,
    "due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."content_item_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "text" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "ref_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "due_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "class_group_id" "uuid",
    "lock_after_complete" boolean DEFAULT false NOT NULL,
    "require_teacher_unlock" boolean DEFAULT false NOT NULL,
    "unlock_days_after_previous" integer,
    CONSTRAINT "content_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'deleted'::"text"]))),
    CONSTRAINT "content_items_type_check" CHECK (("type" = ANY (ARRAY['quiz'::"text", 'learning_content'::"text", 'formative_assignment'::"text", 'survey'::"text"])))
);


ALTER TABLE "public"."content_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."content_items"."lock_after_complete" IS 'When true, this content item becomes inaccessible to students after they mark it as complete. Used in conjunction with progressive unlock to prevent students from reviewing certain content.';



COMMENT ON COLUMN "public"."content_items"."require_teacher_unlock" IS 'When true, this content item is locked for students until a teacher explicitly unlocks it per student.';



COMMENT ON COLUMN "public"."content_items"."unlock_days_after_previous" IS 'If set, this item unlocks only after this many calendar days since the previous item was completed. Null or 0 = no delay.';



CREATE TABLE IF NOT EXISTS "public"."institution_admin_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "institution_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "token" "text",
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "max_uses" integer,
    "uses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "institution_admin_invites_uses_check" CHECK (("uses" >= 0))
);


ALTER TABLE "public"."institution_admin_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."institution_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "institution_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "institution_members_role_check" CHECK (("role" = 'admin'::"text"))
);


ALTER TABLE "public"."institution_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."institutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "institutions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."institutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learning_content_id" "text" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "video_url" "text",
    "body" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "class_group_id" "uuid",
    CONSTRAINT "learning_contents_content_type_check" CHECK (("content_type" = ANY (ARRAY['video'::"text", 'text'::"text", 'mixed'::"text"]))),
    CONSTRAINT "learning_contents_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."learning_contents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_super_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_super_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "answers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quiz_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."quiz_submissions" IS 'Stores student submissions for quizzes';



COMMENT ON COLUMN "public"."quiz_submissions"."quiz_id" IS 'References quizzes.id';



COMMENT ON COLUMN "public"."quiz_submissions"."class_id" IS 'References classes.id';



COMMENT ON COLUMN "public"."quiz_submissions"."student_id" IS 'Authenticated student id';



COMMENT ON COLUMN "public"."quiz_submissions"."answers" IS 'Array of answers: [{ question_id: string, selected_option_id: string }]';



COMMENT ON COLUMN "public"."quiz_submissions"."submitted_at" IS 'Timestamp when the submission was completed';



CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "text" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "class_group_id" "uuid",
    "randomize_questions" boolean DEFAULT false NOT NULL,
    "randomize_options" boolean DEFAULT false NOT NULL,
    "show_points_to_students" boolean DEFAULT true NOT NULL,
    "instructions" "text",
    CONSTRAINT "quizzes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'deleted'::"text"]))),
    CONSTRAINT "quizzes_total_points_check" CHECK (("total_points" >= 0))
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quizzes"."questions" IS 'Array of MCQ question objects: order, prompt, options[{id,text}], correct_option_id, points';



CREATE TABLE IF NOT EXISTS "public"."setting_values" (
    "scope" "public"."setting_scope" NOT NULL,
    "scope_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "allow_admin_edit" boolean DEFAULT false NOT NULL,
    "allow_child_override" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."setting_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."static_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text" NOT NULL,
    "assignment_id" "text" NOT NULL,
    "question_order" integer NOT NULL,
    "attempt_number" integer NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."static_activity" OWNER TO "postgres";


COMMENT ON TABLE "public"."static_activity" IS 'Stores typed text entries for static_text submission mode (parallels voice_messages and chat_messages)';



CREATE TABLE IF NOT EXISTS "public"."student_content_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_content_completions" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_content_completions" IS 'Tracks which students have manually marked content items as complete';



COMMENT ON COLUMN "public"."student_content_completions"."student_id" IS 'The student who marked the content as complete';



COMMENT ON COLUMN "public"."student_content_completions"."content_item_id" IS 'The content item that was marked complete';



COMMENT ON COLUMN "public"."student_content_completions"."completed_at" IS 'When the content was marked as complete';



CREATE TABLE IF NOT EXISTS "public"."student_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'feedback_available'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text" NOT NULL,
    "assignment_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text",
    "storage_path" "text" NOT NULL,
    "parsed_content_url" "text",
    "processing_status" "text" DEFAULT 'uploading'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "submission_files_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['uploading'::"text", 'uploaded'::"text", 'processing'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."submission_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_session_audio" (
    "submission_id" "text" NOT NULL,
    "question_order" integer NOT NULL,
    "attempt_number" integer NOT NULL,
    "composite_audio_chunk_urls" "text"[] DEFAULT '{}'::"text"[],
    "recording_started_at" timestamp with time zone
);


ALTER TABLE "public"."submission_session_audio" OWNER TO "postgres";


COMMENT ON TABLE "public"."submission_session_audio" IS 'Session-level composite audio stored as chunk URLs (one WAV per ~60s); frontend plays in order';



COMMENT ON COLUMN "public"."submission_session_audio"."recording_started_at" IS 'UTC timestamp when audiobuffer.start_recording() was called for this session';



CREATE TABLE IF NOT EXISTS "public"."submission_transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text" NOT NULL,
    "question_order" integer NOT NULL,
    "attempt_number" integer NOT NULL,
    "answer_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."submission_transcripts" OWNER TO "postgres";


COMMENT ON TABLE "public"."submission_transcripts" IS 'Reliable archive of aggregated transcripts per attempt, used as primary read path for transcript display and session restore';



CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text" NOT NULL,
    "assignment_id" "text" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "evaluations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "submission_mode" "text" DEFAULT 'voice'::"text",
    "student_id" "uuid",
    "responder_details" "jsonb",
    "experience_rating" integer,
    "experience_rating_feedback" "text",
    "has_attempts" boolean DEFAULT false NOT NULL,
    "highest_score" numeric(12,4) DEFAULT 0 NOT NULL,
    "max_score" numeric(12,4) DEFAULT 0 NOT NULL,
    "total_attempts" integer DEFAULT 0 NOT NULL,
    "questions_attempted_count" integer DEFAULT 0 NOT NULL,
    "has_pending_approvals" boolean DEFAULT false,
    "tab_leave_events" "jsonb" DEFAULT '[]'::"jsonb",
    "input_violation_events" "jsonb" DEFAULT '[]'::"jsonb",
    "integrity_access_revoked_at" timestamp with time zone,
    "integrity_access_revoked_reason" "text",
    "file_ids" "uuid"[],
    "generated_questions" "jsonb",
    "generated_from_file_ids" "jsonb",
    "questions_generated_at" timestamp with time zone,
    CONSTRAINT "check_student_identifier" CHECK ((("student_id" IS NOT NULL) OR ("responder_details" IS NOT NULL))),
    CONSTRAINT "submissions_experience_rating_check" CHECK ((("experience_rating" >= 1) AND ("experience_rating" <= 5))),
    CONSTRAINT "submissions_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "submissions_submission_mode_check" CHECK (("submission_mode" = ANY (ARRAY['voice'::"text", 'text_chat'::"text", 'static_text'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."submissions" IS 'Stores student submissions for assignments';



COMMENT ON COLUMN "public"."submissions"."submission_id" IS 'Unique short ID for the submission (8 characters)';



COMMENT ON COLUMN "public"."submissions"."assignment_id" IS 'References assignments.assignment_id';



COMMENT ON COLUMN "public"."submissions"."preferred_language" IS 'Language preference for the submission';



COMMENT ON COLUMN "public"."submissions"."evaluations" IS 'JSONB holding per-question evaluation data (scores, rubric_scores, evaluation_feedback, attempt metadata). Transcripts are stored separately in submission_transcripts.';



COMMENT ON COLUMN "public"."submissions"."submitted_at" IS 'Timestamp when the submission was completed';



COMMENT ON COLUMN "public"."submissions"."status" IS 'Current status: in_progress or completed';



COMMENT ON COLUMN "public"."submissions"."experience_rating" IS 'Student experience rating on a 1-5 scale, collected at submission time';



COMMENT ON COLUMN "public"."submissions"."experience_rating_feedback" IS 'Optional text feedback explaining the experience rating';



COMMENT ON COLUMN "public"."submissions"."has_attempts" IS 'Whether the submission has any non-stale attempts (denormalized from evaluations JSONB)';



COMMENT ON COLUMN "public"."submissions"."highest_score" IS 'Sum of highest scores per question across non-stale attempts (denormalized; may be fractional)';



COMMENT ON COLUMN "public"."submissions"."max_score" IS 'Sum of max possible scores across questions (denormalized; may be fractional)';



COMMENT ON COLUMN "public"."submissions"."total_attempts" IS 'Total count of non-stale attempts across all questions (denormalized)';



COMMENT ON COLUMN "public"."submissions"."questions_attempted_count" IS 'Denormalized: count of question orders that have at least one non-stale attempt in evaluations.';



COMMENT ON COLUMN "public"."submissions"."integrity_access_revoked_at" IS 'When set, student cannot continue assessment; APIs return 403.';



COMMENT ON COLUMN "public"."submissions"."integrity_access_revoked_reason" IS 'Machine code e.g. tab_switch_threshold; cleared with revoked_at.';



CREATE TABLE IF NOT EXISTS "public"."survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "answers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."survey_responses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."survey_responses"."answers" IS 'Array of answer objects: question_order, value (string for open_ended, number for likert)';



CREATE TABLE IF NOT EXISTS "public"."surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "text" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "class_group_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "surveys_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."surveys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."surveys"."questions" IS 'Array of survey question objects: order, type (likert|open_ended), prompt, options (for likert), required';



CREATE TABLE IF NOT EXISTS "public"."teacher_content_unlocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "unlocked_by" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teacher_content_unlocks" OWNER TO "postgres";


COMMENT ON TABLE "public"."teacher_content_unlocks" IS 'Tracks which content items have been explicitly unlocked by a teacher for individual students.';



COMMENT ON COLUMN "public"."teacher_content_unlocks"."content_item_id" IS 'The content item that was unlocked';



COMMENT ON COLUMN "public"."teacher_content_unlocks"."student_id" IS 'The student for whom the content was unlocked';



COMMENT ON COLUMN "public"."teacher_content_unlocks"."unlocked_by" IS 'The teacher who performed the unlock';



COMMENT ON COLUMN "public"."teacher_content_unlocks"."unlocked_at" IS 'When the unlock occurred';



CREATE TABLE IF NOT EXISTS "public"."voice_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text",
    "assignment_id" "text" NOT NULL,
    "question_order" integer NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "audio_file_url" "text",
    "attempt_number" integer,
    "duration_seconds" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "interrupted" boolean DEFAULT false,
    "spoken_at" timestamp with time zone,
    "generated_content" "text",
    "utterance_id" "text",
    CONSTRAINT "voice_messages_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."voice_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."voice_messages" IS 'Stores voice messages with audio file URLs from voice assessment sessions';



COMMENT ON COLUMN "public"."voice_messages"."submission_id" IS 'References submissions.submission_id (nullable for messages before submission creation)';



COMMENT ON COLUMN "public"."voice_messages"."assignment_id" IS 'References assignments.assignment_id';



COMMENT ON COLUMN "public"."voice_messages"."question_order" IS 'Order of the question in the assignment (0-indexed or 1-indexed based on assignment structure)';



COMMENT ON COLUMN "public"."voice_messages"."role" IS 'Role of the speaker: student or assistant';



COMMENT ON COLUMN "public"."voice_messages"."content" IS 'Transcript text of the voice message';



COMMENT ON COLUMN "public"."voice_messages"."audio_file_url" IS 'URL to the audio file stored in Firebase Storage (nullable for disconnect fallback)';



COMMENT ON COLUMN "public"."voice_messages"."attempt_number" IS 'Attempt number for grouping messages by evaluation attempt';



COMMENT ON COLUMN "public"."voice_messages"."duration_seconds" IS 'Duration of the audio recording in seconds (optional)';



COMMENT ON COLUMN "public"."voice_messages"."interrupted" IS 'True if the utterance was interrupted (audio is partial, transcript is full)';



COMMENT ON COLUMN "public"."voice_messages"."spoken_at" IS 'Timestamp when the utterance was spoken (for accurate timing analysis)';



COMMENT ON COLUMN "public"."voice_messages"."generated_content" IS 'Full LLM-generated text for assistant messages (may be longer than content if interrupted)';



COMMENT ON COLUMN "public"."voice_messages"."utterance_id" IS 'Stable ID for correlating transcript and audio (e.g. submission:question:attempt:role:ordinal)';



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_function_bindings"
    ADD CONSTRAINT "ai_function_bindings_pkey" PRIMARY KEY ("scope", "scope_id", "binding_key");



ALTER TABLE ONLY "public"."ai_institution_settings"
    ADD CONSTRAINT "ai_institution_settings_pkey" PRIMARY KEY ("institution_id");



ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_provider_activations"
    ADD CONSTRAINT "ai_provider_activations_pkey" PRIMARY KEY ("scope", "scope_id", "provider_id");



ALTER TABLE ONLY "public"."approved_teachers"
    ADD CONSTRAINT "approved_teachers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."approved_teachers"
    ADD CONSTRAINT "approved_teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_assignment_id_key" UNIQUE ("assignment_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_group_memberships"
    ADD CONSTRAINT "class_group_memberships_class_id_student_id_key" UNIQUE ("class_id", "student_id");



ALTER TABLE ONLY "public"."class_group_memberships"
    ADD CONSTRAINT "class_group_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_class_id_group_index_key" UNIQUE ("class_id", "group_index");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_institution_moves"
    ADD CONSTRAINT "class_institution_moves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_mandatory_fields"
    ADD CONSTRAINT "class_mandatory_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_student_invites"
    ADD CONSTRAINT "class_student_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_student_invites"
    ADD CONSTRAINT "class_student_invites_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."class_students"
    ADD CONSTRAINT "class_students_class_id_student_id_key" UNIQUE ("class_id", "student_id");



ALTER TABLE ONLY "public"."class_students"
    ADD CONSTRAINT "class_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_teacher_invites"
    ADD CONSTRAINT "class_teacher_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_teacher_invites"
    ADD CONSTRAINT "class_teacher_invites_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."class_teachers"
    ADD CONSTRAINT "class_teachers_class_id_teacher_id_key" UNIQUE ("class_id", "teacher_id");



ALTER TABLE ONLY "public"."class_teachers"
    ADD CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_class_id_key" UNIQUE ("class_id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_item_overrides"
    ADD CONSTRAINT "content_item_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_content_item_id_key" UNIQUE ("content_item_id");



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institution_admin_invites"
    ADD CONSTRAINT "institution_admin_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institution_admin_invites"
    ADD CONSTRAINT "institution_admin_invites_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."institution_members"
    ADD CONSTRAINT "institution_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institution_members"
    ADD CONSTRAINT "institution_members_unique_membership" UNIQUE ("institution_id", "user_id");



ALTER TABLE ONLY "public"."institutions"
    ADD CONSTRAINT "institutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institutions"
    ADD CONSTRAINT "institutions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."learning_contents"
    ADD CONSTRAINT "learning_contents_learning_content_id_key" UNIQUE ("learning_content_id");



ALTER TABLE ONLY "public"."learning_contents"
    ADD CONSTRAINT "learning_contents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_super_admins"
    ADD CONSTRAINT "platform_super_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_quiz_id_student_id_key" UNIQUE ("quiz_id", "student_id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_quiz_id_key" UNIQUE ("quiz_id");



ALTER TABLE ONLY "public"."setting_values"
    ADD CONSTRAINT "setting_values_pkey" PRIMARY KEY ("scope", "scope_id", "key");



ALTER TABLE ONLY "public"."static_activity"
    ADD CONSTRAINT "static_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_class_info"
    ADD CONSTRAINT "student_class_info_class_id_student_id_key" UNIQUE ("class_id", "student_id");



ALTER TABLE ONLY "public"."student_class_info"
    ADD CONSTRAINT "student_class_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_content_completions"
    ADD CONSTRAINT "student_content_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_content_completions"
    ADD CONSTRAINT "student_content_completions_student_id_content_item_id_key" UNIQUE ("student_id", "content_item_id");



ALTER TABLE ONLY "public"."student_notifications"
    ADD CONSTRAINT "student_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_files"
    ADD CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_session_audio"
    ADD CONSTRAINT "submission_session_audio_pkey" PRIMARY KEY ("submission_id", "question_order", "attempt_number");



ALTER TABLE ONLY "public"."submission_transcripts"
    ADD CONSTRAINT "submission_transcripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_student_id_key" UNIQUE ("survey_id", "student_id");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_survey_id_key" UNIQUE ("survey_id");



ALTER TABLE ONLY "public"."teacher_content_unlocks"
    ADD CONSTRAINT "teacher_content_unlocks_content_item_id_student_id_key" UNIQUE ("content_item_id", "student_id");



ALTER TABLE ONLY "public"."teacher_content_unlocks"
    ADD CONSTRAINT "teacher_content_unlocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."static_activity"
    ADD CONSTRAINT "unique_static_activity" UNIQUE ("submission_id", "question_order", "attempt_number");



ALTER TABLE ONLY "public"."submission_transcripts"
    ADD CONSTRAINT "unique_transcript" UNIQUE ("submission_id", "question_order", "attempt_number");



ALTER TABLE ONLY "public"."voice_messages"
    ADD CONSTRAINT "voice_messages_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_function_bindings_scope_idx" ON "public"."ai_function_bindings" USING "btree" ("scope", "scope_id");



CREATE INDEX "ai_invocations_app_function_started_idx" ON "public"."ai_invocations" USING "btree" ("app_function_key", "started_at" DESC);



CREATE INDEX "ai_invocations_assignment_started_idx" ON "public"."ai_invocations" USING "btree" ("assignment_id", "started_at" DESC) WHERE ("assignment_id" IS NOT NULL);



CREATE INDEX "ai_invocations_pending_idx" ON "public"."ai_invocations" USING "btree" ("started_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "ai_invocations_submission_fn_started_idx" ON "public"."ai_invocations" USING "btree" ("submission_id", "app_function_key", "started_at" DESC);



CREATE INDEX "ai_provider_activations_scope_idx" ON "public"."ai_provider_activations" USING "btree" ("scope", "scope_id");



CREATE INDEX "chat_messages_ai_invocation_id_idx" ON "public"."chat_messages" USING "btree" ("ai_invocation_id") WHERE ("ai_invocation_id" IS NOT NULL);



CREATE INDEX "chat_messages_submission_idx" ON "public"."chat_messages" USING "btree" ("submission_id", "question_order", "attempt_number", "created_at");



CREATE INDEX "class_institution_moves_class_id_idx" ON "public"."class_institution_moves" USING "btree" ("class_id");



CREATE INDEX "class_institution_moves_created_at_idx" ON "public"."class_institution_moves" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "class_teachers_one_owner_per_class" ON "public"."class_teachers" USING "btree" ("class_id") WHERE ("role" = 'owner'::"text");



CREATE INDEX "classes_institution_id_idx" ON "public"."classes" USING "btree" ("institution_id");



CREATE INDEX "idx_activity_events_class_id" ON "public"."activity_events" USING "btree" ("class_id");



CREATE INDEX "idx_activity_events_component" ON "public"."activity_events" USING "btree" ("component_type", "component_id");



CREATE INDEX "idx_activity_events_created_at" ON "public"."activity_events" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_activity_events_event_id_unique" ON "public"."activity_events" USING "btree" ("event_id");



CREATE INDEX "idx_activity_events_event_type" ON "public"."activity_events" USING "btree" ("event_type");



CREATE INDEX "idx_activity_events_interaction_source" ON "public"."activity_events" USING "btree" ("interaction_source");



CREATE INDEX "idx_activity_events_submission_id" ON "public"."activity_events" USING "btree" ("submission_id");



CREATE INDEX "idx_activity_events_user_id" ON "public"."activity_events" USING "btree" ("user_id");



CREATE INDEX "idx_activity_logs_class_id" ON "public"."activity_logs" USING "btree" ("class_id");



CREATE INDEX "idx_activity_logs_component" ON "public"."activity_logs" USING "btree" ("component_type", "component_id");



CREATE UNIQUE INDEX "idx_activity_logs_session" ON "public"."activity_logs" USING "btree" ("session_id");



CREATE INDEX "idx_activity_logs_submission_id" ON "public"."activity_logs" USING "btree" ("submission_id");



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_assignments_assignment_id" ON "public"."assignments" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignments_class_group_id" ON "public"."assignments" USING "btree" ("class_group_id");



CREATE INDEX "idx_assignments_class_id" ON "public"."assignments" USING "btree" ("class_id");



CREATE INDEX "idx_assignments_created_by" ON "public"."assignments" USING "btree" ("created_by");



CREATE INDEX "idx_assignments_has_bot_prompt_config" ON "public"."assignments" USING "btree" ((("bot_prompt_config" IS NOT NULL))) WHERE ("bot_prompt_config" IS NOT NULL);



CREATE INDEX "idx_assignments_is_public" ON "public"."assignments" USING "btree" ("is_public") WHERE ("is_public" = true);



CREATE INDEX "idx_assignments_status" ON "public"."assignments" USING "btree" ("status");



CREATE INDEX "idx_class_group_memberships_class_id" ON "public"."class_group_memberships" USING "btree" ("class_id");



CREATE INDEX "idx_class_group_memberships_group_id" ON "public"."class_group_memberships" USING "btree" ("group_id");



CREATE INDEX "idx_class_group_memberships_student_id" ON "public"."class_group_memberships" USING "btree" ("student_id");



CREATE INDEX "idx_class_groups_class_id" ON "public"."class_groups" USING "btree" ("class_id");



CREATE INDEX "idx_class_mandatory_fields_class_id" ON "public"."class_mandatory_fields" USING "btree" ("class_id");



CREATE INDEX "idx_class_student_invites_class_id" ON "public"."class_student_invites" USING "btree" ("class_id");



CREATE INDEX "idx_class_student_invites_token_hash" ON "public"."class_student_invites" USING "btree" ("token_hash");



CREATE UNIQUE INDEX "idx_class_student_invites_unique_class_id" ON "public"."class_student_invites" USING "btree" ("class_id");



CREATE INDEX "idx_class_students_class_id" ON "public"."class_students" USING "btree" ("class_id");



CREATE INDEX "idx_class_students_student_id" ON "public"."class_students" USING "btree" ("student_id");



CREATE INDEX "idx_class_teacher_invites_class_id" ON "public"."class_teacher_invites" USING "btree" ("class_id");



CREATE INDEX "idx_class_teacher_invites_token_hash" ON "public"."class_teacher_invites" USING "btree" ("token_hash");



CREATE UNIQUE INDEX "idx_class_teacher_invites_unique_class_id" ON "public"."class_teacher_invites" USING "btree" ("class_id");



CREATE INDEX "idx_class_teachers_class_id" ON "public"."class_teachers" USING "btree" ("class_id");



CREATE INDEX "idx_class_teachers_teacher_id" ON "public"."class_teachers" USING "btree" ("teacher_id");



CREATE INDEX "idx_classes_class_id" ON "public"."classes" USING "btree" ("class_id");



CREATE INDEX "idx_classes_created_by" ON "public"."classes" USING "btree" ("created_by");



CREATE INDEX "idx_classes_status" ON "public"."classes" USING "btree" ("status");



CREATE INDEX "idx_content_item_overrides_content_item_id" ON "public"."content_item_overrides" USING "btree" ("content_item_id");



CREATE INDEX "idx_content_item_overrides_group_key" ON "public"."content_item_overrides" USING "btree" ("group_key");



CREATE INDEX "idx_content_items_class_group_position" ON "public"."content_items" USING "btree" ("class_group_id", "position");



CREATE INDEX "idx_content_items_class_id" ON "public"."content_items" USING "btree" ("class_id");



CREATE INDEX "idx_content_items_class_position" ON "public"."content_items" USING "btree" ("class_id", "position");



CREATE INDEX "idx_content_items_ref_id" ON "public"."content_items" USING "btree" ("ref_id");



CREATE INDEX "idx_content_items_status" ON "public"."content_items" USING "btree" ("status");



CREATE INDEX "idx_content_items_student_entity_lookup" ON "public"."content_items" USING "btree" ("class_id", "type", "ref_id", "class_group_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_content_items_type" ON "public"."content_items" USING "btree" ("type");



CREATE UNIQUE INDEX "idx_content_items_unique_group_position_active" ON "public"."content_items" USING "btree" ("class_group_id", "position") WHERE (("class_group_id" IS NOT NULL) AND ("status" = ANY (ARRAY['active'::"text", 'draft'::"text"])));



CREATE UNIQUE INDEX "idx_content_items_unique_ref_per_group" ON "public"."content_items" USING "btree" ("class_id", "class_group_id", "type", "ref_id") WHERE (("class_group_id" IS NOT NULL) AND ("status" = ANY (ARRAY['active'::"text", 'draft'::"text"])));



CREATE INDEX "idx_institution_admin_invites_institution_id" ON "public"."institution_admin_invites" USING "btree" ("institution_id");



CREATE INDEX "idx_institution_admin_invites_token_hash" ON "public"."institution_admin_invites" USING "btree" ("token_hash");



CREATE UNIQUE INDEX "idx_institution_admin_invites_unique_institution_id" ON "public"."institution_admin_invites" USING "btree" ("institution_id");



CREATE INDEX "idx_learning_contents_class_group_id" ON "public"."learning_contents" USING "btree" ("class_group_id");



CREATE INDEX "idx_learning_contents_class_id" ON "public"."learning_contents" USING "btree" ("class_id");



CREATE INDEX "idx_learning_contents_learning_content_id" ON "public"."learning_contents" USING "btree" ("learning_content_id");



CREATE INDEX "idx_learning_contents_status" ON "public"."learning_contents" USING "btree" ("status");



CREATE INDEX "idx_quiz_submissions_class_id" ON "public"."quiz_submissions" USING "btree" ("class_id");



CREATE INDEX "idx_quiz_submissions_quiz_id" ON "public"."quiz_submissions" USING "btree" ("quiz_id");



CREATE INDEX "idx_quiz_submissions_student_id" ON "public"."quiz_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_quizzes_class_group_id" ON "public"."quizzes" USING "btree" ("class_group_id");



CREATE INDEX "idx_quizzes_class_id" ON "public"."quizzes" USING "btree" ("class_id");



CREATE INDEX "idx_quizzes_quiz_id" ON "public"."quizzes" USING "btree" ("quiz_id");



CREATE INDEX "idx_quizzes_status" ON "public"."quizzes" USING "btree" ("status");



CREATE INDEX "idx_static_activity_submission" ON "public"."static_activity" USING "btree" ("submission_id");



CREATE INDEX "idx_student_class_info_class_id" ON "public"."student_class_info" USING "btree" ("class_id");



CREATE INDEX "idx_student_class_info_student_id" ON "public"."student_class_info" USING "btree" ("student_id");



CREATE INDEX "idx_student_content_completions_completed_at" ON "public"."student_content_completions" USING "btree" ("completed_at");



CREATE INDEX "idx_student_content_completions_content_item_id" ON "public"."student_content_completions" USING "btree" ("content_item_id");



CREATE INDEX "idx_student_content_completions_student_content" ON "public"."student_content_completions" USING "btree" ("student_id", "content_item_id");



CREATE INDEX "idx_student_content_completions_student_id" ON "public"."student_content_completions" USING "btree" ("student_id");



CREATE INDEX "idx_submission_files_assignment_id" ON "public"."submission_files" USING "btree" ("assignment_id");



CREATE INDEX "idx_submission_files_submission_id" ON "public"."submission_files" USING "btree" ("submission_id");



CREATE INDEX "idx_submissions_assignment_id" ON "public"."submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_submissions_responder_details" ON "public"."submissions" USING "gin" ("responder_details");



CREATE INDEX "idx_submissions_status" ON "public"."submissions" USING "btree" ("status");



CREATE INDEX "idx_submissions_student_id" ON "public"."submissions" USING "btree" ("student_id");



CREATE INDEX "idx_submissions_submission_id" ON "public"."submissions" USING "btree" ("submission_id");



CREATE INDEX "idx_survey_responses_student_id" ON "public"."survey_responses" USING "btree" ("student_id");



CREATE INDEX "idx_survey_responses_survey_id" ON "public"."survey_responses" USING "btree" ("survey_id");



CREATE INDEX "idx_surveys_class_group_id" ON "public"."surveys" USING "btree" ("class_group_id");



CREATE INDEX "idx_surveys_class_id" ON "public"."surveys" USING "btree" ("class_id");



CREATE INDEX "idx_surveys_status" ON "public"."surveys" USING "btree" ("status");



CREATE INDEX "idx_surveys_survey_id" ON "public"."surveys" USING "btree" ("survey_id");



CREATE INDEX "idx_teacher_content_unlocks_content_item_id" ON "public"."teacher_content_unlocks" USING "btree" ("content_item_id");



CREATE INDEX "idx_teacher_content_unlocks_content_student" ON "public"."teacher_content_unlocks" USING "btree" ("content_item_id", "student_id");



CREATE INDEX "idx_teacher_content_unlocks_student_id" ON "public"."teacher_content_unlocks" USING "btree" ("student_id");



CREATE INDEX "idx_transcripts_submission" ON "public"."submission_transcripts" USING "btree" ("submission_id");



CREATE INDEX "idx_voice_messages_assignment_id" ON "public"."voice_messages" USING "btree" ("assignment_id");



CREATE INDEX "idx_voice_messages_attempt_number" ON "public"."voice_messages" USING "btree" ("attempt_number");



CREATE INDEX "idx_voice_messages_question_order" ON "public"."voice_messages" USING "btree" ("question_order");



CREATE INDEX "idx_voice_messages_submission_id" ON "public"."voice_messages" USING "btree" ("submission_id");



CREATE INDEX "idx_voice_messages_submission_question" ON "public"."voice_messages" USING "btree" ("submission_id", "question_order", "attempt_number");



CREATE INDEX "institution_members_user_id_idx" ON "public"."institution_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "institutions_one_default" ON "public"."institutions" USING "btree" ("is_default") WHERE ("is_default" = true);



CREATE INDEX "setting_values_key_idx" ON "public"."setting_values" USING "btree" ("key");



CREATE INDEX "setting_values_scope_idx" ON "public"."setting_values" USING "btree" ("scope", "scope_id");



CREATE INDEX "student_notifications_student_id_idx" ON "public"."student_notifications" USING "btree" ("student_id", "created_at" DESC);



CREATE INDEX "voice_messages_utterance_id_idx" ON "public"."voice_messages" USING "btree" ("utterance_id");



CREATE OR REPLACE TRIGGER "activity_logs_updated_at" BEFORE UPDATE ON "public"."activity_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_activity_logs_updated_at"();



CREATE OR REPLACE TRIGGER "ai_function_bindings_enforce_policy_trg" BEFORE INSERT OR UPDATE ON "public"."ai_function_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."ai_catalog_enforce_institution_policy"();



CREATE OR REPLACE TRIGGER "ai_institution_settings_enforce_super_admin_locks_trg" BEFORE INSERT OR UPDATE ON "public"."ai_institution_settings" FOR EACH ROW EXECUTE FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"();



CREATE OR REPLACE TRIGGER "ai_provider_activations_enforce_policy_trg" BEFORE INSERT OR UPDATE ON "public"."ai_provider_activations" FOR EACH ROW EXECUTE FUNCTION "public"."ai_catalog_enforce_institution_policy"();



CREATE OR REPLACE TRIGGER "class_students_assign_group" AFTER INSERT ON "public"."class_students" FOR EACH ROW EXECUTE FUNCTION "public"."trg_class_students_assign_group"();



CREATE OR REPLACE TRIGGER "class_teachers_enforce_role_change_trg" BEFORE UPDATE ON "public"."class_teachers" FOR EACH ROW EXECUTE FUNCTION "public"."class_teachers_enforce_role_change"();



CREATE OR REPLACE TRIGGER "class_teachers_prevent_owner_delete_trg" BEFORE DELETE ON "public"."class_teachers" FOR EACH ROW EXECUTE FUNCTION "public"."class_teachers_prevent_owner_delete"();



CREATE OR REPLACE TRIGGER "classes_after_insert_owner_trg" AFTER INSERT ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_classes_after_insert_owner"();



CREATE OR REPLACE TRIGGER "classes_cleanup_setting_values_trg" AFTER DELETE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_setting_values_for_class"();



CREATE OR REPLACE TRIGGER "classes_ensure_groups" AFTER INSERT ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_classes_ensure_groups"();



CREATE OR REPLACE TRIGGER "guard_classes_institution_change_trg" BEFORE UPDATE OF "institution_id" ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."guard_classes_institution_change"();



CREATE OR REPLACE TRIGGER "guard_classes_soft_delete_trg" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."guard_classes_immutable_and_delete"();



CREATE OR REPLACE TRIGGER "institutions_cleanup_setting_values_trg" AFTER DELETE ON "public"."institutions" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_setting_values_for_institution"();



CREATE OR REPLACE TRIGGER "set_class_default_institution_trg" BEFORE INSERT ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_class_default_institution"();



CREATE OR REPLACE TRIGGER "setting_values_enforce_locks_trg" BEFORE INSERT OR UPDATE ON "public"."setting_values" FOR EACH ROW EXECUTE FUNCTION "public"."setting_values_enforce_locks"();



CREATE OR REPLACE TRIGGER "trg_content_items_validate_ref" BEFORE INSERT OR UPDATE OF "type", "ref_id", "class_id" ON "public"."content_items" FOR EACH ROW EXECUTE FUNCTION "public"."content_items_validate_ref"();



CREATE OR REPLACE TRIGGER "update_assignments_updated_at" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_class_groups_updated_at" BEFORE UPDATE ON "public"."class_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_class_mandatory_fields_updated_at" BEFORE UPDATE ON "public"."class_mandatory_fields" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_class_student_invites_updated_at" BEFORE UPDATE ON "public"."class_student_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_class_teacher_invites_updated_at" BEFORE UPDATE ON "public"."class_teacher_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_content_item_overrides_updated_at" BEFORE UPDATE ON "public"."content_item_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_content_items_updated_at" BEFORE UPDATE ON "public"."content_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_institution_admin_invites_updated_at" BEFORE UPDATE ON "public"."institution_admin_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_learning_contents_updated_at" BEFORE UPDATE ON "public"."learning_contents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quizzes_updated_at" BEFORE UPDATE ON "public"."quizzes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_student_class_info_updated_at" BEFORE UPDATE ON "public"."student_class_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_submission_files_updated_at" BEFORE UPDATE ON "public"."submission_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_surveys_updated_at" BEFORE UPDATE ON "public"."surveys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_function_bindings"
    ADD CONSTRAINT "ai_function_bindings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_institution_settings"
    ADD CONSTRAINT "ai_institution_settings_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_institution_settings"
    ADD CONSTRAINT "ai_institution_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_retry_of_fkey" FOREIGN KEY ("retry_of") REFERENCES "public"."ai_invocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_provider_activations"
    ADD CONSTRAINT "ai_provider_activations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_ai_invocation_id_fkey" FOREIGN KEY ("ai_invocation_id") REFERENCES "public"."ai_invocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("submission_id");



ALTER TABLE ONLY "public"."class_group_memberships"
    ADD CONSTRAINT "class_group_memberships_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_group_memberships"
    ADD CONSTRAINT "class_group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."class_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_institution_moves"
    ADD CONSTRAINT "class_institution_moves_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_institution_moves"
    ADD CONSTRAINT "class_institution_moves_from_institution_id_fkey" FOREIGN KEY ("from_institution_id") REFERENCES "public"."institutions"("id");



ALTER TABLE ONLY "public"."class_institution_moves"
    ADD CONSTRAINT "class_institution_moves_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."class_institution_moves"
    ADD CONSTRAINT "class_institution_moves_to_institution_id_fkey" FOREIGN KEY ("to_institution_id") REFERENCES "public"."institutions"("id");



ALTER TABLE ONLY "public"."class_mandatory_fields"
    ADD CONSTRAINT "class_mandatory_fields_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_student_invites"
    ADD CONSTRAINT "class_student_invites_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_students"
    ADD CONSTRAINT "class_students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_teacher_invites"
    ADD CONSTRAINT "class_teacher_invites_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_teachers"
    ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_teachers"
    ADD CONSTRAINT "class_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id");



ALTER TABLE ONLY "public"."content_item_overrides"
    ADD CONSTRAINT "content_item_overrides_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."institution_admin_invites"
    ADD CONSTRAINT "institution_admin_invites_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."institution_members"
    ADD CONSTRAINT "institution_members_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."institution_members"
    ADD CONSTRAINT "institution_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_contents"
    ADD CONSTRAINT "learning_contents_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_contents"
    ADD CONSTRAINT "learning_contents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_super_admins"
    ADD CONSTRAINT "platform_super_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."setting_values"
    ADD CONSTRAINT "setting_values_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."student_class_info"
    ADD CONSTRAINT "student_class_info_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_content_completions"
    ADD CONSTRAINT "student_content_completions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_content_completions"
    ADD CONSTRAINT "student_content_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_notifications"
    ADD CONSTRAINT "student_notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_content_unlocks"
    ADD CONSTRAINT "teacher_content_unlocks_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_content_unlocks"
    ADD CONSTRAINT "teacher_content_unlocks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_content_unlocks"
    ADD CONSTRAINT "teacher_content_unlocks_unlocked_by_fkey" FOREIGN KEY ("unlocked_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Admins manage institution admin invites" ON "public"."institution_admin_invites" USING (("public"."is_platform_super_admin"() OR "public"."is_institution_admin"("institution_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_institution_admin"("institution_id")));



CREATE POLICY "Admins read institution admin invites" ON "public"."institution_admin_invites" FOR SELECT USING (("public"."is_platform_super_admin"() OR "public"."is_institution_admin"("institution_id")));



CREATE POLICY "Allow anonymous activity event inserts" ON "public"."activity_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (("user_id" IS NULL));



CREATE POLICY "Allow anonymous activity log inserts" ON "public"."activity_logs" FOR INSERT WITH CHECK (("user_id" IS NULL));



CREATE POLICY "Allow anonymous activity log updates" ON "public"."activity_logs" FOR UPDATE USING ((("user_id" IS NULL) AND ("session_id" IS NOT NULL))) WITH CHECK (("user_id" IS NULL));



CREATE POLICY "Allow authenticated users to read assignments" ON "public"."assignments" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"text") AND (("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "assignments"."class_id") AND ("classes"."created_by" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."class_teachers"
  WHERE (("class_teachers"."class_id" = "assignments"."class_id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))));



CREATE POLICY "Allow public read access to public assignments" ON "public"."assignments" FOR SELECT TO "anon" USING ((("is_public" = true) AND ("status" = 'active'::"text")));



CREATE POLICY "Allow public to create chat messages" ON "public"."chat_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to create static activity" ON "public"."static_activity" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to create submission transcripts" ON "public"."submission_transcripts" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to create submission_session_audio" ON "public"."submission_session_audio" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to create submissions" ON "public"."submissions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to create voice messages" ON "public"."voice_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public to read chat messages" ON "public"."chat_messages" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to read static activity" ON "public"."static_activity" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to read submission transcripts" ON "public"."submission_transcripts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to read submission_session_audio" ON "public"."submission_session_audio" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to read submissions" ON "public"."submissions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to read voice messages" ON "public"."voice_messages" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public to update submission transcripts" ON "public"."submission_transcripts" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public to update submission_session_audio" ON "public"."submission_session_audio" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public to update submissions" ON "public"."submissions" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public to update voice messages" ON "public"."voice_messages" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Anyone can delete files for public assignment submissions" ON "public"."submission_files" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."assignment_id" = "submission_files"."assignment_id") AND ("a"."is_public" = true)))));



CREATE POLICY "Anyone can insert files for public assignment submissions" ON "public"."submission_files" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."assignment_id" = "submission_files"."assignment_id") AND ("a"."is_public" = true)))));



CREATE POLICY "Anyone can update files for public assignment submissions" ON "public"."submission_files" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."assignment_id" = "submission_files"."assignment_id") AND ("a"."is_public" = true)))));



CREATE POLICY "Anyone can view files for public assignment submissions" ON "public"."submission_files" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."assignment_id" = "submission_files"."assignment_id") AND ("a"."is_public" = true)))));



CREATE POLICY "Authenticated read platform ai function bindings" ON "public"."ai_function_bindings" FOR SELECT USING (("scope" = 'platform'::"public"."ai_config_scope"));



CREATE POLICY "Authenticated read platform ai provider activations" ON "public"."ai_provider_activations" FOR SELECT USING (("scope" = 'platform'::"public"."ai_config_scope"));



CREATE POLICY "Authenticated users can check approval" ON "public"."approved_teachers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Class co-teachers manage class ai function bindings" ON "public"."ai_function_bindings" USING ((("scope" = 'class'::"public"."ai_config_scope") AND "public"."is_class_co_teacher"("scope_id"))) WITH CHECK ((("scope" = 'class'::"public"."ai_config_scope") AND "public"."is_class_co_teacher"("scope_id")));



CREATE POLICY "Class co-teachers manage class ai provider activations" ON "public"."ai_provider_activations" USING ((("scope" = 'class'::"public"."ai_config_scope") AND "public"."is_class_co_teacher"("scope_id"))) WITH CHECK ((("scope" = 'class'::"public"."ai_config_scope") AND "public"."is_class_co_teacher"("scope_id")));



CREATE POLICY "Class co-teachers read ai institution settings" ON "public"."ai_institution_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."institution_id" = "ai_institution_settings"."institution_id") AND "public"."is_class_co_teacher"("c"."id")))));



CREATE POLICY "Class config managers manage class groups" ON "public"."class_groups" USING ("public"."can_configure_class"("class_id")) WITH CHECK ("public"."can_configure_class"("class_id"));



CREATE POLICY "Class config managers manage class settings" ON "public"."setting_values" USING ((("scope" = 'class'::"public"."setting_scope") AND "public"."can_configure_class"("scope_id"))) WITH CHECK ((("scope" = 'class'::"public"."setting_scope") AND "public"."can_configure_class"("scope_id")));



CREATE POLICY "Class config managers update classes" ON "public"."classes" FOR UPDATE USING ("public"."can_configure_class"("id")) WITH CHECK ("public"."can_configure_class"("id"));



CREATE POLICY "Class members read class ai function bindings" ON "public"."ai_function_bindings" FOR SELECT USING ((("scope" = 'class'::"public"."ai_config_scope") AND ("public"."is_class_co_teacher"("scope_id") OR "public"."is_class_student"("scope_id"))));



CREATE POLICY "Class members read class ai provider activations" ON "public"."ai_provider_activations" FOR SELECT USING ((("scope" = 'class'::"public"."ai_config_scope") AND ("public"."is_class_co_teacher"("scope_id") OR "public"."is_class_student"("scope_id"))));



CREATE POLICY "Class members read institution ai function bindings" ON "public"."ai_function_bindings" FOR SELECT USING ((("scope" = 'institution'::"public"."ai_config_scope") AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."institution_id" = "ai_function_bindings"."scope_id") AND ("public"."is_class_co_teacher"("c"."id") OR "public"."is_class_student"("c"."id")))))));



CREATE POLICY "Class members read institution ai provider activations" ON "public"."ai_provider_activations" FOR SELECT USING ((("scope" = 'institution'::"public"."ai_config_scope") AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."institution_id" = "ai_provider_activations"."scope_id") AND ("public"."is_class_co_teacher"("c"."id") OR "public"."is_class_student"("c"."id")))))));



CREATE POLICY "Class members read institution settings" ON "public"."setting_values" FOR SELECT USING ((("scope" = 'institution'::"public"."setting_scope") AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."institution_id" = "setting_values"."scope_id") AND ("public"."is_class_co_teacher"("c"."id") OR "public"."is_class_student"("c"."id")))))));



CREATE POLICY "Co-teachers can view their classes" ON "public"."classes" FOR SELECT USING ("public"."is_class_co_teacher"("id"));



CREATE POLICY "Full control may delete classes" ON "public"."classes" FOR DELETE USING (("public"."has_full_class_control"("id") OR "public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("id")));



CREATE POLICY "Institution admins manage ai function bindings" ON "public"."ai_function_bindings" USING ((("scope" = 'institution'::"public"."ai_config_scope") AND "public"."is_institution_admin"("scope_id"))) WITH CHECK ((("scope" = 'institution'::"public"."ai_config_scope") AND "public"."is_institution_admin"("scope_id")));



CREATE POLICY "Institution admins manage ai provider activations" ON "public"."ai_provider_activations" USING ((("scope" = 'institution'::"public"."ai_config_scope") AND "public"."is_institution_admin"("scope_id"))) WITH CHECK ((("scope" = 'institution'::"public"."ai_config_scope") AND "public"."is_institution_admin"("scope_id")));



CREATE POLICY "Institution admins manage settings" ON "public"."setting_values" USING (((("scope" = 'institution'::"public"."setting_scope") AND "public"."is_institution_admin"("scope_id")) OR (("scope" = 'class'::"public"."setting_scope") AND "public"."is_class_institution_admin"("scope_id")))) WITH CHECK (((("scope" = 'institution'::"public"."setting_scope") AND "public"."is_institution_admin"("scope_id")) OR (("scope" = 'class'::"public"."setting_scope") AND "public"."is_class_institution_admin"("scope_id"))));



CREATE POLICY "Institution admins manage their institution classes" ON "public"."classes" USING ("public"."is_institution_admin"("institution_id")) WITH CHECK ("public"."is_institution_admin"("institution_id"));



CREATE POLICY "Institution admins read ai institution settings" ON "public"."ai_institution_settings" FOR SELECT USING ("public"."is_institution_admin"("institution_id"));



CREATE POLICY "Institution admins read own institution members" ON "public"."institution_members" FOR SELECT USING ("public"."is_institution_admin"("institution_id"));



CREATE POLICY "Institution admins read their institutions" ON "public"."institutions" FOR SELECT USING ("public"."is_institution_admin"("id"));



CREATE POLICY "Owners can view their classes" ON "public"."classes" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Roster managers can create teacher invites" ON "public"."class_teacher_invites" FOR INSERT WITH CHECK ("public"."can_manage_class_roster"("class_id"));



CREATE POLICY "Roster managers can delete class teachers" ON "public"."class_teachers" FOR DELETE USING ("public"."can_manage_class_roster"("class_id"));



CREATE POLICY "Roster managers can update teacher invites" ON "public"."class_teacher_invites" FOR UPDATE USING ("public"."can_manage_class_roster"("class_id")) WITH CHECK ("public"."can_manage_class_roster"("class_id"));



CREATE POLICY "Roster managers can view teacher invites" ON "public"."class_teacher_invites" FOR SELECT USING ("public"."can_manage_class_roster"("class_id"));



CREATE POLICY "Roster managers update class teacher roles" ON "public"."class_teachers" FOR UPDATE USING ("public"."can_manage_class_roster"("class_id")) WITH CHECK ("public"."can_manage_class_roster"("class_id"));



CREATE POLICY "Service role can insert notifications" ON "public"."student_notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Student can join class" ON "public"."class_students" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Student can view their enrollment" ON "public"."class_students" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Student can view their membership" ON "public"."class_group_memberships" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can delete own completions" ON "public"."student_content_completions" FOR DELETE USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can insert own activity events" ON "public"."activity_events" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



CREATE POLICY "Students can insert own activity logs" ON "public"."activity_logs" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



CREATE POLICY "Students can insert own completions" ON "public"."student_content_completions" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can insert own quiz submissions" ON "public"."quiz_submissions" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can manage their class info" ON "public"."student_class_info" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can submit their own responses" ON "public"."survey_responses" FOR INSERT WITH CHECK ((("student_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."surveys" "s"
  WHERE (("s"."id" = "survey_responses"."survey_id") AND ("s"."status" = 'active'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."content_items" "ci"
          WHERE (("ci"."class_id" = "s"."class_id") AND ("ci"."ref_id" = "s"."id") AND ("ci"."type" = 'survey'::"text") AND ("ci"."class_group_id" IS NOT NULL) AND ("ci"."status" = 'active'::"text") AND "public"."is_student_in_group"("ci"."class_id", "ci"."class_group_id")))))))));



CREATE POLICY "Students can update own activity logs" ON "public"."activity_logs" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL))) WITH CHECK ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



CREATE POLICY "Students can update their own submissions" ON "public"."submissions" FOR UPDATE USING (((("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"())) OR ("responder_details" IS NOT NULL))) WITH CHECK (((("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"())) OR ("responder_details" IS NOT NULL)));



CREATE POLICY "Students can view active surveys in their group" ON "public"."surveys" FOR SELECT USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."content_items" "ci"
  WHERE (("ci"."class_id" = "surveys"."class_id") AND ("ci"."ref_id" = "surveys"."id") AND ("ci"."type" = 'survey'::"text") AND ("ci"."class_group_id" IS NOT NULL) AND ("ci"."status" = 'active'::"text") AND "public"."is_student_in_group"("ci"."class_id", "ci"."class_group_id"))))));



CREATE POLICY "Students can view assignments for their group" ON "public"."assignments" FOR SELECT USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."content_items" "ci"
  WHERE (("ci"."class_id" = "assignments"."class_id") AND ("ci"."ref_id" = "assignments"."id") AND ("ci"."type" = 'formative_assignment'::"text") AND ("ci"."class_group_id" IS NOT NULL) AND ("ci"."status" = 'active'::"text") AND "public"."is_student_in_group"("ci"."class_id", "ci"."class_group_id"))))));



CREATE POLICY "Students can view content items for their group" ON "public"."content_items" FOR SELECT USING ((("class_group_id" IS NOT NULL) AND "public"."is_student_in_group"("class_id", "class_group_id") AND ("status" = 'active'::"text")));



CREATE POLICY "Students can view learning contents for their group" ON "public"."learning_contents" FOR SELECT USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."content_items" "ci"
  WHERE (("ci"."class_id" = "learning_contents"."class_id") AND ("ci"."ref_id" = "learning_contents"."id") AND ("ci"."type" = 'learning_content'::"text") AND ("ci"."class_group_id" IS NOT NULL) AND ("ci"."status" = 'active'::"text") AND "public"."is_student_in_group"("ci"."class_id", "ci"."class_group_id"))))));



CREATE POLICY "Students can view mandatory fields" ON "public"."class_mandatory_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."class_students"
  WHERE (("class_students"."class_id" = "class_mandatory_fields"."class_id") AND ("class_students"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students can view own activity events" ON "public"."activity_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view own activity logs" ON "public"."activity_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view own completions" ON "public"."student_content_completions" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view own quiz submissions" ON "public"."quiz_submissions" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view own unlocks" ON "public"."teacher_content_unlocks" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view quizzes for their group" ON "public"."quizzes" FOR SELECT USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."content_items" "ci"
  WHERE (("ci"."class_id" = "quizzes"."class_id") AND ("ci"."ref_id" = "quizzes"."id") AND ("ci"."type" = 'quiz'::"text") AND ("ci"."class_group_id" IS NOT NULL) AND ("ci"."status" = 'active'::"text") AND "public"."is_student_in_group"("ci"."class_id", "ci"."class_group_id"))))));



CREATE POLICY "Students can view their class info" ON "public"."student_class_info" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their classes" ON "public"."classes" FOR SELECT USING ("public"."is_class_student"("id"));



CREATE POLICY "Students can view their own responses" ON "public"."survey_responses" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own submissions" ON "public"."submissions" FOR SELECT USING (((("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"())) OR ("responder_details" IS NOT NULL)));



CREATE POLICY "Students can view their submission files" ON "public"."submission_files" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."submission_id" = "submission_files"."submission_id") AND ("s"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students read own notifications" ON "public"."student_notifications" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students update own notifications" ON "public"."student_notifications" FOR UPDATE USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Super admins manage all ai function bindings" ON "public"."ai_function_bindings" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage all ai institution settings" ON "public"."ai_institution_settings" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage all ai provider activations" ON "public"."ai_provider_activations" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage all classes" ON "public"."classes" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage all settings" ON "public"."setting_values" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage institution members" ON "public"."institution_members" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage institutions" ON "public"."institutions" USING ("public"."is_platform_super_admin"()) WITH CHECK ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins manage platform ai function bindings" ON "public"."ai_function_bindings" USING ((("scope" = 'platform'::"public"."ai_config_scope") AND "public"."is_platform_super_admin"())) WITH CHECK ((("scope" = 'platform'::"public"."ai_config_scope") AND "public"."is_platform_super_admin"()));



CREATE POLICY "Super admins manage platform ai provider activations" ON "public"."ai_provider_activations" USING ((("scope" = 'platform'::"public"."ai_config_scope") AND "public"."is_platform_super_admin"())) WITH CHECK ((("scope" = 'platform'::"public"."ai_config_scope") AND "public"."is_platform_super_admin"()));



CREATE POLICY "Super admins read all institution members" ON "public"."institution_members" FOR SELECT USING ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins read all institutions" ON "public"."institutions" FOR SELECT USING ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins read class moves audit" ON "public"."class_institution_moves" FOR SELECT USING ("public"."is_platform_super_admin"());



CREATE POLICY "Super admins read super admin list" ON "public"."platform_super_admins" FOR SELECT USING ("public"."is_platform_super_admin"());



CREATE POLICY "Super and institution admins manage class group memberships" ON "public"."class_group_memberships" USING (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id")));



CREATE POLICY "Super and institution admins manage class groups" ON "public"."class_groups" USING (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id")));



CREATE POLICY "Super and institution admins manage class mandatory fields" ON "public"."class_mandatory_fields" USING (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id")));



CREATE POLICY "Super and institution admins manage class teacher invites" ON "public"."class_teacher_invites" USING (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id")));



CREATE POLICY "Super and institution admins manage class teachers" ON "public"."class_teachers" USING (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id"))) WITH CHECK (("public"."is_platform_super_admin"() OR "public"."is_class_institution_admin"("class_id")));



CREATE POLICY "Teachers and roster managers can view class teachers" ON "public"."class_teachers" FOR SELECT USING (("public"."can_manage_class_roster"("class_id") OR "public"."is_class_co_teacher"("class_id")));



CREATE POLICY "Teachers can create assignments for their classes" ON "public"."assignments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "assignments"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create content item overrides" ON "public"."content_item_overrides" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "content_item_overrides"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "c"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create content items for their classes" ON "public"."content_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "content_items"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create learning contents for their classes" ON "public"."learning_contents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "learning_contents"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create quizzes for their classes" ON "public"."quizzes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quizzes"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create student invites" ON "public"."class_student_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_student_invites"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can create surveys for their classes" ON "public"."surveys" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "surveys"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete class assignments" ON "public"."assignments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "assignments"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete class completions" ON "public"."student_content_completions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "student_content_completions"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete class quiz submissions" ON "public"."quiz_submissions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quiz_submissions"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete class unlocks" ON "public"."teacher_content_unlocks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("ci"."class_id" = "c"."id")))
  WHERE (("ci"."id" = "teacher_content_unlocks"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete content item overrides" ON "public"."content_item_overrides" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "content_item_overrides"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "c"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete survey responses" ON "public"."survey_responses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."surveys" "s"
     JOIN "public"."classes" "c" ON (("c"."id" = "s"."class_id")))
  WHERE (("s"."id" = "survey_responses"."survey_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete their class content items" ON "public"."content_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "content_items"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete their class learning contents" ON "public"."learning_contents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "learning_contents"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete their class quizzes" ON "public"."quizzes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quizzes"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can delete their class surveys" ON "public"."surveys" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "surveys"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can insert class unlocks" ON "public"."teacher_content_unlocks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("ci"."class_id" = "c"."id")))
  WHERE (("ci"."id" = "teacher_content_unlocks"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can manage class memberships" ON "public"."class_group_memberships" USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_group_memberships"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_group_memberships"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can manage mandatory fields" ON "public"."class_mandatory_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_mandatory_fields"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_mandatory_fields"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update class assignments" ON "public"."assignments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "assignments"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update class_students enrollment status" ON "public"."class_students" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_students"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_students"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update content item overrides" ON "public"."content_item_overrides" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "content_item_overrides"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "c"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "content_item_overrides"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "c"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update student invites" ON "public"."class_student_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_student_invites"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_student_invites"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update submissions for their class assignments" ON "public"."submissions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."assignments"
     JOIN "public"."classes" ON (("classes"."id" = "assignments"."class_id")))
  WHERE (("assignments"."assignment_id" = "submissions"."assignment_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."assignments"
     JOIN "public"."classes" ON (("classes"."id" = "assignments"."class_id")))
  WHERE (("assignments"."assignment_id" = "submissions"."assignment_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update their class content items" ON "public"."content_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "content_items"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "content_items"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update their class learning contents" ON "public"."learning_contents" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "learning_contents"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "learning_contents"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update their class quizzes" ON "public"."quizzes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quizzes"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quizzes"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can update their class surveys" ON "public"."surveys" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "surveys"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "surveys"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class activity events" ON "public"."activity_events" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."class_teachers" "ct"
  WHERE (("ct"."class_id" = "activity_events"."class_id") AND ("ct"."teacher_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "activity_events"."class_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Teachers can view class activity logs" ON "public"."activity_logs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."class_teachers" "ct"
  WHERE (("ct"."class_id" = "activity_logs"."class_id") AND ("ct"."teacher_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "activity_logs"."class_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Teachers can view class completions" ON "public"."student_content_completions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("ci"."class_id" = "c"."id")))
  WHERE (("ci"."id" = "student_content_completions"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class groups" ON "public"."class_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_groups"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class memberships" ON "public"."class_group_memberships" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_group_memberships"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class quiz submissions" ON "public"."quiz_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quiz_submissions"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class students" ON "public"."class_students" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_students"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view class unlocks" ON "public"."teacher_content_unlocks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("ci"."class_id" = "c"."id")))
  WHERE (("ci"."id" = "teacher_content_unlocks"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view content item overrides" ON "public"."content_item_overrides" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."content_items" "ci"
     JOIN "public"."classes" "c" ON (("c"."id" = "ci"."class_id")))
  WHERE (("ci"."id" = "content_item_overrides"."content_item_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "c"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view mandatory fields" ON "public"."class_mandatory_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_mandatory_fields"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view student class info" ON "public"."student_class_info" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "student_class_info"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view student invites" ON "public"."class_student_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_student_invites"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view submission files for their classes" ON "public"."submission_files" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."assignments" "a"
     JOIN "public"."classes" "c" ON (("c"."id" = "a"."class_id")))
  WHERE (("a"."assignment_id" = "submission_files"."assignment_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view submissions for their class assignments" ON "public"."submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."assignments"
     JOIN "public"."classes" ON (("classes"."id" = "assignments"."class_id")))
  WHERE (("assignments"."assignment_id" = "submissions"."assignment_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view survey responses" ON "public"."survey_responses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."surveys" "s"
     JOIN "public"."classes" "c" ON (("c"."id" = "s"."class_id")))
  WHERE (("s"."id" = "survey_responses"."survey_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers" "ct"
          WHERE (("ct"."class_id" = "c"."id") AND ("ct"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their class assignments" ON "public"."assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "assignments"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their class content items" ON "public"."content_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "content_items"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their class learning contents" ON "public"."learning_contents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "learning_contents"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their class quizzes" ON "public"."quizzes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "quizzes"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their class surveys" ON "public"."surveys" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "surveys"."class_id") AND (("classes"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."class_teachers"
          WHERE (("class_teachers"."class_id" = "classes"."id") AND ("class_teachers"."teacher_id" = "auth"."uid"())))))))));



CREATE POLICY "Teachers can view their own class_teachers entries" ON "public"."class_teachers" FOR SELECT USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can create classes" ON "public"."classes" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete their class teacher records" ON "public"."class_teachers" FOR DELETE USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their submission files" ON "public"."submission_files" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."submission_id" = "submission_files"."submission_id") AND ("s"."student_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert class teacher records for their classes" ON "public"."class_teachers" FOR INSERT WITH CHECK (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can insert files for their submissions" ON "public"."submission_files" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."submission_id" = "submission_files"."submission_id") AND ("s"."student_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their submission files" ON "public"."submission_files" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."submission_id" = "submission_files"."submission_id") AND ("s"."student_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their class teacher records" ON "public"."class_teachers" FOR SELECT USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own classes" ON "public"."classes" FOR SELECT USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."activity_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_function_bindings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_institution_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_invocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_provider_activations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approved_teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_group_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_institution_moves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_mandatory_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_student_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_teacher_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_item_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."institution_admin_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."institution_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."institutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_contents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_super_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quiz_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quizzes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."setting_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."static_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_class_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_content_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_session_audio" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_transcripts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surveys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teacher_content_unlocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voice_messages" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_institution_admin_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_student_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_student_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_student_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_teacher_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_teacher_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_teacher_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_catalog_enforce_institution_policy"() TO "anon";
GRANT ALL ON FUNCTION "public"."ai_catalog_enforce_institution_policy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_catalog_enforce_institution_policy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"() TO "anon";
GRANT ALL ON FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_institution_settings_enforce_super_admin_locks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_student_to_group"("p_class_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_student_to_group"("p_class_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_student_to_group"("p_class_id" "uuid", "p_student_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_configure_class"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_configure_class"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_configure_class"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_configure_class"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_class_roster"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_promote_co_owner"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."class_teachers_enforce_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."class_teachers_enforce_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."class_teachers_enforce_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."class_teachers_prevent_owner_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."class_teachers_prevent_owner_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."class_teachers_prevent_owner_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_class"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_class"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_class"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_institution"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_institution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_setting_values_for_institution"() TO "service_role";



GRANT ALL ON FUNCTION "public"."content_items_validate_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."content_items_validate_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."content_items_validate_ref"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_institution_admin_invite"("p_institution_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_student_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_student_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_student_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."default_institution_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."default_institution_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."default_institution_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_class_groups"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_class_groups"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_class_groups"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON TABLE "public"."class_mandatory_fields" TO "anon";
GRANT ALL ON TABLE "public"."class_mandatory_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."class_mandatory_fields" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_mandatory_fields"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_mandatory_fields"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_mandatory_fields"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_student_progress_summary"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_students_with_user_info"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_students_with_user_info"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_students_with_user_info"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_teachers_with_user_info"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_teachers_with_user_info"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_teachers_with_user_info"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_institution_member_emails"("p_institution_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."student_class_info" TO "anon";
GRANT ALL ON TABLE "public"."student_class_info" TO "authenticated";
GRANT ALL ON TABLE "public"."student_class_info" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_by_ids"("p_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_classes_immutable_and_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_classes_immutable_and_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_classes_immutable_and_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_classes_institution_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_classes_institution_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_classes_institution_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_completed_mandatory_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_completed_mandatory_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_completed_mandatory_info"("p_class_id" "uuid", "p_student_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_full_class_control"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_co_owner"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_co_teacher"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_co_teacher"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_co_teacher"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_institution_admin"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_institution_admin"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_institution_admin"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_owner"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_owner"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_owner"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_student"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_student"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_student"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_teacher_admin"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_default_institution"("p_institution_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_default_institution"("p_institution_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_default_institution"("p_institution_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_institution_admin"("p_institution_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_institution_admin"("p_institution_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_institution_admin"("p_institution_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_student_in_group"("p_class_id" "uuid", "p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_student_in_group"("p_class_id" "uuid", "p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_student_in_group"("p_class_id" "uuid", "p_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_class_to_institution"("p_class_id" "uuid", "p_target_institution_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reconfigure_class_groups"("p_class_id" "uuid", "p_new_group_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."reconfigure_class_groups"("p_class_id" "uuid", "p_new_group_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconfigure_class_groups"("p_class_id" "uuid", "p_new_group_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_institution_admin_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_student_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_student_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_student_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_teacher_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_teacher_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_teacher_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_class_default_institution"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_class_default_institution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_class_default_institution"() TO "service_role";



GRANT ALL ON FUNCTION "public"."setting_values_enforce_locks"() TO "anon";
GRANT ALL ON FUNCTION "public"."setting_values_enforce_locks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."setting_values_enforce_locks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_class_primary_owner"("p_class_id" "uuid", "p_new_owner_teacher_id" "uuid", "p_demote_previous_to" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_class_students_assign_group"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_class_students_assign_group"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_class_students_assign_group"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_classes_after_insert_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_classes_after_insert_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_classes_after_insert_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_classes_ensure_groups"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_classes_ensure_groups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_classes_ensure_groups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_activity_logs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_activity_logs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_activity_logs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid", "p_field_responses" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid", "p_field_responses" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_student_class_info"("p_class_id" "uuid", "p_student_id" "uuid", "p_field_responses" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_institution_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_institution_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_institution_ids"() TO "service_role";


















GRANT ALL ON TABLE "public"."activity_events" TO "anon";
GRANT ALL ON TABLE "public"."activity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_events" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_function_bindings" TO "anon";
GRANT ALL ON TABLE "public"."ai_function_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_function_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_institution_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_institution_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_institution_settings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_invocations" TO "anon";
GRANT ALL ON TABLE "public"."ai_invocations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_invocations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_provider_activations" TO "anon";
GRANT ALL ON TABLE "public"."ai_provider_activations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_provider_activations" TO "service_role";



GRANT ALL ON TABLE "public"."approved_teachers" TO "anon";
GRANT ALL ON TABLE "public"."approved_teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."approved_teachers" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."class_group_memberships" TO "anon";
GRANT ALL ON TABLE "public"."class_group_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."class_group_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."class_groups" TO "anon";
GRANT ALL ON TABLE "public"."class_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."class_groups" TO "service_role";



GRANT ALL ON TABLE "public"."class_institution_moves" TO "anon";
GRANT ALL ON TABLE "public"."class_institution_moves" TO "authenticated";
GRANT ALL ON TABLE "public"."class_institution_moves" TO "service_role";



GRANT ALL ON TABLE "public"."class_student_invites" TO "anon";
GRANT ALL ON TABLE "public"."class_student_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."class_student_invites" TO "service_role";



GRANT ALL ON TABLE "public"."class_students" TO "anon";
GRANT ALL ON TABLE "public"."class_students" TO "authenticated";
GRANT ALL ON TABLE "public"."class_students" TO "service_role";



GRANT ALL ON TABLE "public"."class_teacher_invites" TO "anon";
GRANT ALL ON TABLE "public"."class_teacher_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."class_teacher_invites" TO "service_role";



GRANT ALL ON TABLE "public"."class_teachers" TO "anon";
GRANT ALL ON TABLE "public"."class_teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."class_teachers" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."content_item_overrides" TO "anon";
GRANT ALL ON TABLE "public"."content_item_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."content_item_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."content_items" TO "anon";
GRANT ALL ON TABLE "public"."content_items" TO "authenticated";
GRANT ALL ON TABLE "public"."content_items" TO "service_role";



GRANT ALL ON TABLE "public"."institution_admin_invites" TO "anon";
GRANT ALL ON TABLE "public"."institution_admin_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."institution_admin_invites" TO "service_role";



GRANT ALL ON TABLE "public"."institution_members" TO "anon";
GRANT ALL ON TABLE "public"."institution_members" TO "authenticated";
GRANT ALL ON TABLE "public"."institution_members" TO "service_role";



GRANT ALL ON TABLE "public"."institutions" TO "anon";
GRANT ALL ON TABLE "public"."institutions" TO "authenticated";
GRANT ALL ON TABLE "public"."institutions" TO "service_role";



GRANT ALL ON TABLE "public"."learning_contents" TO "anon";
GRANT ALL ON TABLE "public"."learning_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_contents" TO "service_role";



GRANT ALL ON TABLE "public"."platform_super_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_submissions" TO "anon";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."setting_values" TO "anon";
GRANT ALL ON TABLE "public"."setting_values" TO "authenticated";
GRANT ALL ON TABLE "public"."setting_values" TO "service_role";



GRANT ALL ON TABLE "public"."static_activity" TO "anon";
GRANT ALL ON TABLE "public"."static_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."static_activity" TO "service_role";



GRANT ALL ON TABLE "public"."student_content_completions" TO "anon";
GRANT ALL ON TABLE "public"."student_content_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."student_content_completions" TO "service_role";



GRANT ALL ON TABLE "public"."student_notifications" TO "anon";
GRANT ALL ON TABLE "public"."student_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."student_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."submission_files" TO "anon";
GRANT ALL ON TABLE "public"."submission_files" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_files" TO "service_role";



GRANT ALL ON TABLE "public"."submission_session_audio" TO "anon";
GRANT ALL ON TABLE "public"."submission_session_audio" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_session_audio" TO "service_role";



GRANT ALL ON TABLE "public"."submission_transcripts" TO "anon";
GRANT ALL ON TABLE "public"."submission_transcripts" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_transcripts" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."survey_responses" TO "anon";
GRANT ALL ON TABLE "public"."survey_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_responses" TO "service_role";



GRANT ALL ON TABLE "public"."surveys" TO "anon";
GRANT ALL ON TABLE "public"."surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."surveys" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_content_unlocks" TO "anon";
GRANT ALL ON TABLE "public"."teacher_content_unlocks" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_content_unlocks" TO "service_role";



GRANT ALL ON TABLE "public"."voice_messages" TO "anon";
GRANT ALL ON TABLE "public"."voice_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "Allow anonymous activity event inserts" on "public"."activity_events";

drop policy "Allow public to create chat messages" on "public"."chat_messages";

drop policy "Allow public to read chat messages" on "public"."chat_messages";

drop policy "Allow public to create submissions" on "public"."submissions";

drop policy "Allow public to read submissions" on "public"."submissions";

drop policy "Allow public to update submissions" on "public"."submissions";

drop policy "Allow public to create voice messages" on "public"."voice_messages";

drop policy "Allow public to read voice messages" on "public"."voice_messages";

drop policy "Allow public to update voice messages" on "public"."voice_messages";


  create policy "Allow anonymous activity event inserts"
  on "public"."activity_events"
  as permissive
  for insert
  to anon, authenticated
with check ((user_id IS NULL));



  create policy "Allow public to create chat messages"
  on "public"."chat_messages"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow public to read chat messages"
  on "public"."chat_messages"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow public to create submissions"
  on "public"."submissions"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow public to read submissions"
  on "public"."submissions"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow public to update submissions"
  on "public"."submissions"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "Allow public to create voice messages"
  on "public"."voice_messages"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow public to read voice messages"
  on "public"."voice_messages"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow public to update voice messages"
  on "public"."voice_messages"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



