-- Institution admins could not see (SELECT) or manage (INSERT/UPDATE/DELETE)
-- class-level AI provider activations / function bindings for classes where
-- they are not personally a class_teachers row. The only "manage" policy on
-- each table covered scope = 'institution' via is_institution_admin(scope_id);
-- there was no scope = 'class' branch via is_class_institution_admin(scope_id),
-- unlike the equivalent policy already on setting_values
-- ("Institution admins manage settings", same base migration, line 4098).
--
-- Effect of the gap: SELECTs for scope='class' were silently filtered to
-- zero rows (RLS defaults to deny), so the class settings page fell back to
-- "inherit institution defaults" even when a teacher's override rows existed.
-- Writes would have thrown a loud RLS violation.
--
-- This is a pure RLS gap-fill, not an authorization change: the app layer
-- (aiConfigCapabilities, src/lib/ai/credentials/capabilities.ts) already
-- grants institution_admin unconditional canEditClassOverride for mode
-- "class", so this migration just makes the DB match what the app already
-- assumes.

drop policy if exists "Institution admins manage ai function bindings" on public.ai_function_bindings;
create policy "Institution admins manage ai function bindings" on public.ai_function_bindings
  using (
    (scope = 'institution' and public.is_institution_admin(scope_id))
    or (scope = 'class' and public.is_class_institution_admin(scope_id))
  )
  with check (
    (scope = 'institution' and public.is_institution_admin(scope_id))
    or (scope = 'class' and public.is_class_institution_admin(scope_id))
  );

drop policy if exists "Institution admins manage ai provider activations" on public.ai_provider_activations;
create policy "Institution admins manage ai provider activations" on public.ai_provider_activations
  using (
    (scope = 'institution' and public.is_institution_admin(scope_id))
    or (scope = 'class' and public.is_class_institution_admin(scope_id))
  )
  with check (
    (scope = 'institution' and public.is_institution_admin(scope_id))
    or (scope = 'class' and public.is_class_institution_admin(scope_id))
  );
