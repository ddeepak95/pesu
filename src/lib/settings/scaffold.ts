/**
 * Registry-driven institution scaffolding.
 *
 * Builds the `setting_values` rows that make institution-owned settings
 * (those declaring `institutionScaffold`) exist per-institution with the
 * correct lock columns. Seeded on institution creation via
 * `createInstitution`, backfilled for existing institutions via
 * `scripts/backfill-institution-settings.ts`, and mirrored in `seed.sql` for
 * the default institution.
 *
 * Pure and dependency-free (no `server-only`) so it can be imported from
 * server code and standalone scripts alike.
 */
import { SETTINGS_REGISTRY, type AnySettingDefinition } from "./registry";

export interface InstitutionScaffoldRow {
  scope: "institution";
  scope_id: string;
  key: string;
  value: unknown;
  allow_admin_edit: boolean;
  allow_child_override: boolean;
  updated_by: string | null;
}

/**
 * One row per registry entry that declares `institutionScaffold`, ready to
 * upsert with `onConflict: "scope,scope_id,key"` + `ignoreDuplicates: true` so
 * a re-run never clobbers a customized institution value.
 */
export function buildInstitutionScaffoldRows(
  institutionId: string,
  userId: string | null
): InstitutionScaffoldRow[] {
  return (Object.values(SETTINGS_REGISTRY) as AnySettingDefinition[])
    .filter((def) => def.institutionScaffold)
    .map((def) => ({
      scope: "institution" as const,
      scope_id: institutionId,
      key: def.key,
      value: def.institutionScaffold!.value ?? def.default,
      allow_admin_edit: def.institutionScaffold!.allowAdminEdit,
      allow_child_override: def.institutionScaffold!.allowChildOverride,
      updated_by: userId,
    }));
}
