-- The "Allow public to ..." policies on submissions grant full INSERT/UPDATE/SELECT
-- access to both the anon and authenticated roles with no ownership check at all
-- (USING/WITH CHECK (true)). They coexist with the narrower "Students can ..."
-- policies below (RLS policies are OR'd), so those narrower policies never actually
-- constrained anything. Net effect: any authenticated student could read or write
-- any other student's submission row, not just their own.
--
-- The narrower policies also had their own gap: `responder_details IS NOT NULL` was
-- meant to allow the unauthenticated public-link flow through (those submissions have
-- no student_id, so ownership can't be checked), but responder_details is set on
-- authenticated submissions too, so that clause matched every row, not just public
-- ones. Scoping it to `student_id IS NULL` fixes that.

DROP POLICY IF EXISTS "Allow public to create submissions" ON "public"."submissions";
DROP POLICY IF EXISTS "Allow public to update submissions" ON "public"."submissions";
DROP POLICY IF EXISTS "Allow public to read submissions" ON "public"."submissions";

DROP POLICY IF EXISTS "Students can update their own submissions" ON "public"."submissions";
CREATE POLICY "Students can update their own submissions" ON "public"."submissions"
  FOR UPDATE
  USING (
    (("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"()))
    OR (("student_id" IS NULL) AND ("responder_details" IS NOT NULL))
  )
  WITH CHECK (
    (("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"()))
    OR (("student_id" IS NULL) AND ("responder_details" IS NOT NULL))
  );

DROP POLICY IF EXISTS "Students can view their own submissions" ON "public"."submissions";
CREATE POLICY "Students can view their own submissions" ON "public"."submissions"
  FOR SELECT
  USING (
    (("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"()))
    OR (("student_id" IS NULL) AND ("responder_details" IS NOT NULL))
  );

CREATE POLICY "Students can create their own submissions" ON "public"."submissions"
  FOR INSERT
  WITH CHECK (
    (("student_id" IS NOT NULL) AND ("student_id" = "auth"."uid"()))
    OR (("student_id" IS NULL) AND ("responder_details" IS NOT NULL))
  );
