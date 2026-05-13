/**
 * Scope-agnostic data access for `public.setting_values`.
 *
 * These helpers accept a `SupabaseClient` so they can be used from server
 * components (with a server-side client) or from SWR fetchers (with the
 * browser client). RLS + the DB lock trigger remain the source of truth for
 * authorization; the TS capabilities helper is the optimistic mirror.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildClassSettings,
  buildInstitutionSettings,
  type EffectiveSettings,
  type SettingRow,
} from "@/lib/settings/resolve";
import type {
  SettingKey,
  SettingScope,
} from "@/lib/settings/registry";

const SETTING_ROW_COLUMNS =
  "scope, scope_id, key, value, allow_admin_edit, allow_child_override, updated_by, updated_at";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSettingRowsForScope(
  supabase: SupabaseClient,
  scope: SettingScope,
  scopeId: string
): Promise<SettingRow[]> {
  const { data, error } = await supabase
    .from("setting_values")
    .select(SETTING_ROW_COLUMNS)
    .eq("scope", scope)
    .eq("scope_id", scopeId);
  if (error) throw error;
  return (data ?? []) as SettingRow[];
}

/**
 * Resolve all effective settings for an institution.
 */
export async function getEffectiveSettingsForInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<EffectiveSettings> {
  const rows = await listSettingRowsForScope(
    supabase,
    "institution",
    institutionId
  );
  return buildInstitutionSettings(rows);
}

/**
 * Resolve all effective settings for a class — requires the class's
 * `institution_id` so we can fetch the parent rows.
 */
export async function getEffectiveSettingsForClass(
  supabase: SupabaseClient,
  classDbId: string
): Promise<EffectiveSettings> {
  // Look up institution_id without joining (avoids RLS edge cases on classes).
  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  const institutionId = classRow?.institution_id as string | undefined;

  const [instRows, classRows] = await Promise.all([
    institutionId
      ? listSettingRowsForScope(supabase, "institution", institutionId)
      : Promise.resolve<SettingRow[]>([]),
    listSettingRowsForScope(supabase, "class", classDbId),
  ]);

  return buildClassSettings(instRows, classRows);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface UpsertSettingValueArgs {
  scope: SettingScope;
  scopeId: string;
  key: SettingKey;
  value: unknown;
  updatedBy: string;
}

export async function upsertSettingValue(
  supabase: SupabaseClient,
  args: UpsertSettingValueArgs
): Promise<void> {
  const { error } = await supabase.from("setting_values").upsert(
    {
      scope: args.scope,
      scope_id: args.scopeId,
      key: args.key,
      value: args.value,
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,key" }
  );
  if (error) throw error;
}

export interface ClearSettingValueArgs {
  scope: SettingScope;
  scopeId: string;
  key: SettingKey;
}

export async function clearSettingValue(
  supabase: SupabaseClient,
  args: ClearSettingValueArgs
): Promise<void> {
  const { error } = await supabase
    .from("setting_values")
    .delete()
    .eq("scope", args.scope)
    .eq("scope_id", args.scopeId)
    .eq("key", args.key);
  if (error) throw error;
}

export interface SetSettingLockArgs {
  scope: SettingScope;
  scopeId: string;
  key: SettingKey;
  lock: "allow_admin_edit" | "allow_child_override";
  enabled: boolean;
  updatedBy: string;
}

/**
 * Toggle a lock flag.
 *
 *   * If a row exists: UPDATE only the lock column (value is left untouched).
 *   * If no row exists yet: INSERT a row with the platform default value and
 *     the desired lock. This is intentional — locking a setting that has
 *     never been customized still needs a row to persist the flag.
 *
 * Callers must have already validated the viewer's capability via
 * `assertCanToggleLock` for clearer errors; RLS + the lock trigger remain the
 * final authority.
 */
export async function setSettingLock(
  supabase: SupabaseClient,
  args: SetSettingLockArgs,
  fallbackValue: unknown
): Promise<void> {
  const nowIso = new Date().toISOString();
  const updatePayload = {
    [args.lock]: args.enabled,
    updated_by: args.updatedBy,
    updated_at: nowIso,
  } as Record<string, unknown>;

  const { data: updated, error: updErr } = await supabase
    .from("setting_values")
    .update(updatePayload)
    .eq("scope", args.scope)
    .eq("scope_id", args.scopeId)
    .eq("key", args.key)
    .select("key");
  if (updErr) throw updErr;
  if (updated && updated.length > 0) return;

  const insertPayload = {
    scope: args.scope,
    scope_id: args.scopeId,
    key: args.key,
    value: fallbackValue,
    [args.lock]: args.enabled,
    updated_by: args.updatedBy,
    updated_at: nowIso,
  };
  const { error: insErr } = await supabase
    .from("setting_values")
    .insert(insertPayload);
  if (insErr) throw insErr;
}
