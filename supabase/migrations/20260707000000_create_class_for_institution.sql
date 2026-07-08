-- Institution-admin class creation:
--   * classes created via this path start with no class_teachers row (the
--     creator is an administrator, not automatically a teacher) so they do
--     not show up on the creator's own /teacher/classes page.
--   * a "primary teacher" invite is auto-generated in the same call so it's
--     ready to share immediately, without a follow-up "Generate" click.
--   * teacher invites are split into two independently-bound roles (owner /
--     co-teacher) so accepting one link can never grant the other role.

-- 1. Split the single "one invite per class" constraint into "one invite per
--    (class, intended role)" so a class can have an owner-track invite and a
--    co-teacher-track invite active at the same time.
ALTER TABLE "public"."class_teacher_invites"
  ADD COLUMN "intended_role" "text" NOT NULL DEFAULT 'co-teacher'
  CHECK ("intended_role" IN ('owner', 'co-teacher'));

DROP INDEX IF EXISTS "public"."idx_class_teacher_invites_unique_class_id";
CREATE UNIQUE INDEX "idx_class_teacher_invites_unique_class_id_role"
  ON "public"."class_teacher_invites" ("class_id", "intended_role");

-- 2. create_teacher_invite: accept an intended role, upsert on the new
--    (class_id, intended_role) conflict target, and refuse to hand out a
--    second owner-track invite once the class already has an owner.
--    Adding a parameter changes the function's signature, so CREATE OR
--    REPLACE would leave the old 3-arg overload behind (and that overload's
--    ON CONFLICT (class_id) would now error, since the matching unique
--    index was just replaced above) — drop it explicitly first.
DROP FUNCTION IF EXISTS "public"."create_teacher_invite"("uuid", timestamp with time zone, integer);

CREATE OR REPLACE FUNCTION "public"."create_teacher_invite"(
  "p_class_id" "uuid",
  "p_expires_at" timestamp with time zone DEFAULT (timezone('utc'::text, now()) + '100 years'::interval),
  "p_max_uses" integer DEFAULT NULL::integer,
  "p_role" "text" DEFAULT 'co-teacher'
) RETURNS "text"
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

  IF p_role NOT IN ('owner', 'co-teacher') THEN
    RAISE EXCEPTION 'role must be owner or co-teacher';
  END IF;

  IF p_role = 'owner' AND EXISTS (
    SELECT 1 FROM class_teachers WHERE class_id = p_class_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'This class already has a primary teacher';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO class_teacher_invites
    (class_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at, intended_role)
  VALUES
    (p_class_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL, p_role)
  ON CONFLICT (class_id, intended_role)
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

ALTER FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer, "p_role" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer, "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer, "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_teacher_invite"("p_class_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer, "p_role" "text") TO "service_role";

-- 3. accept_teacher_invite: grant the role bound to the invite row itself
--    (never trust a client-supplied role), guarded by the pre-existing
--    class_teachers_one_owner_per_class partial unique index in case of a
--    genuine race on an owner-track invite.
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

  BEGIN
    INSERT INTO class_teachers (class_id, teacher_id, role)
    VALUES (v_invite.class_id, auth.uid(), v_invite.intended_role);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This class already has a primary teacher';
  END;

  v_is_new_member := TRUE;

  IF v_is_new_member THEN
    UPDATE class_teacher_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;

-- 4. trg_classes_after_insert_owner: skip the automatic owner assignment
--    when create_class_for_institution asks it to. A separate BEFORE DELETE
--    trigger (class_teachers_prevent_owner_delete) unconditionally forbids
--    deleting a class's owner row, so "insert then delete the owner row"
--    is not an option — the insert has to not happen in the first place.
--    Guarded by a transaction-local GUC (set with is_local = true, so it
--    never leaks to other concurrent transactions/sessions) rather than a
--    new column, to leave every other class-creation path byte-for-byte
--    unchanged.
CREATE OR REPLACE FUNCTION "public"."trg_classes_after_insert_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_setting('app.skip_owner_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.class_teachers (class_id, teacher_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (class_id, teacher_id)
  DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;

-- 5. New institution-admin class creation entry point: creates the class
--    without granting the creator a teaching role, then auto-generates the
--    primary-teacher invite so it's ready to share immediately.
CREATE OR REPLACE FUNCTION "public"."create_class_for_institution"(
  "p_institution_id" uuid,
  "p_name" text,
  "p_class_id" text,
  "p_preferred_language" text DEFAULT 'en'
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_class public.classes;
  v_primary_invite_token text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_class_for_institution: no authenticated user';
  END IF;

  IF NOT (
    public.is_platform_super_admin()
    OR public.is_institution_admin(p_institution_id)
  ) THEN
    RAISE EXCEPTION 'Only a platform super admin or institution admin may create a class for this institution';
  END IF;

  -- This is an administrative creation, not a teaching assignment — skip
  -- trg_classes_after_insert_owner's usual "creator becomes owner" so the
  -- class starts with no teacher until the primary-teacher invite (below)
  -- is accepted. Local to this transaction only.
  PERFORM set_config('app.skip_owner_trigger', 'true', true);

  INSERT INTO public.classes
    (name, class_id, created_by, status, preferred_language, institution_id)
  VALUES
    (p_name, p_class_id, v_caller, 'active', p_preferred_language, p_institution_id)
  RETURNING * INTO v_class;

  -- Auto-generate the primary-teacher invite so it's ready to share the
  -- moment the admin sees the "class created" confirmation.
  v_primary_invite_token := public.create_teacher_invite(v_class.id, p_role => 'owner');

  RETURN jsonb_build_object(
    'class', to_jsonb(v_class),
    'primary_invite_token', v_primary_invite_token
  );
END;
$$;

ALTER FUNCTION "public"."create_class_for_institution"("p_institution_id" uuid, "p_name" text, "p_class_id" text, "p_preferred_language" text) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_class_for_institution"("p_institution_id" uuid, "p_name" text, "p_class_id" text, "p_preferred_language" text) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_class_for_institution"("p_institution_id" uuid, "p_name" text, "p_class_id" text, "p_preferred_language" text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_class_for_institution"("p_institution_id" uuid, "p_name" text, "p_class_id" text, "p_preferred_language" text) TO "service_role";
