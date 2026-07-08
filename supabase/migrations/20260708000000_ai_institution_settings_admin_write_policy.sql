-- Institution admins could SELECT ai_institution_settings but had no INSERT/UPDATE
-- policy, so toggling "Allow class teachers to edit" failed with an RLS violation
-- on the first write (upsert insert) for an institution. The existing
-- ai_institution_settings_enforce_super_admin_locks trigger already restricts
-- non-super-admins from changing allow_admin_edit / allow_use_platform_defaults,
-- so it's safe to let institution admins write to their own institution's row.

CREATE POLICY "Institution admins write ai institution settings" ON "public"."ai_institution_settings"
  FOR INSERT
  WITH CHECK ("public"."is_institution_admin"("institution_id"));

CREATE POLICY "Institution admins update ai institution settings" ON "public"."ai_institution_settings"
  FOR UPDATE
  USING ("public"."is_institution_admin"("institution_id"))
  WITH CHECK ("public"."is_institution_admin"("institution_id"));
