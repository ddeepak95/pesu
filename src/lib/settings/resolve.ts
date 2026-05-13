/**
 * Settings resolver — merges defaults, institution rows, and class overrides
 * into an `EffectiveSetting<T>` shape that every UI panel and consumer reads.
 *
 * The pure helpers (`mergeSetting`, `mergeAllForScope`) are unit-testable and
 * importable from both client and server. Database-touching helpers live in
 * `src/lib/queries/settings.ts`.
 */
import {
  SETTINGS_REGISTRY,
  type AnySettingDefinition,
  type SettingDefinition,
  type SettingKey,
  type SettingScope,
  getSettingDefinition,
  isKnownSettingKey,
} from "./registry";

// ---------------------------------------------------------------------------
// Row shape — mirrors `public.setting_values` 1:1.
// ---------------------------------------------------------------------------

export interface SettingRow {
  scope: SettingScope;
  scope_id: string;
  key: string;
  value: unknown;
  allow_admin_edit: boolean;
  allow_child_override: boolean;
  updated_by: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Effective shape returned to callers.
// ---------------------------------------------------------------------------

export interface InstitutionLocks {
  /** Whether the institution admin may edit `value` (super admin always can). */
  allowAdminEdit: boolean;
  /** Whether classes in this institution may override this setting. */
  allowChildOverride: boolean;
}

/**
 * Serializable view of one resolved setting. Intentionally does NOT include
 * the `SettingDefinition` itself — `validate` / `clamp` are functions, so a
 * server component passing this bundle to a client component would crash.
 * Consumers recover the definition via `getSettingDefinition(eff.key)` (or
 * the convenience `effectiveDefinition` helper below).
 */
export interface EffectiveSetting<T = unknown> {
  key: SettingKey;
  /**
   * Effective value at the requested scope, clamped against the parent when
   * a class override is present.
   */
  value: T;
  source: "default" | "institution" | "class";
  /** The institution's resolved value (or the platform default if unset). */
  institutionValue: T;
  /** True iff a class-scope override row exists for this class. */
  hasClassOverride: boolean;
  /** Lock flags currently stored at the institution. */
  institutionLocks: InstitutionLocks;
}

/** Convenience accessor: same setting plus its registry definition. */
export function effectiveDefinition<T>(
  eff: EffectiveSetting<T>
): SettingDefinition<T> {
  return getSettingDefinition(eff.key) as unknown as SettingDefinition<T>;
}

// ---------------------------------------------------------------------------
// Pure merger
// ---------------------------------------------------------------------------

const DEFAULT_LOCKS: InstitutionLocks = {
  allowAdminEdit: true,
  allowChildOverride: true,
};

function safeValidate<T>(
  def: SettingDefinition<T>,
  raw: unknown,
  fallback: T
): T {
  try {
    return def.validate(raw);
  } catch (err) {
    console.warn(
      `[settings] dropping invalid value for "${def.key}" (${(err as Error).message}); using fallback`
    );
    return fallback;
  }
}

/**
 * Resolve the effective value at the institution scope (defaults → institution).
 * Use when rendering an institution settings panel.
 */
export function mergeInstitutionSetting<T>(
  def: SettingDefinition<T>,
  instRow: SettingRow | null
): EffectiveSetting<T> {
  const platformDefault = def.default;
  const institutionValue = instRow
    ? safeValidate(def, instRow.value, platformDefault)
    : platformDefault;
  const locks: InstitutionLocks = instRow
    ? {
        allowAdminEdit: instRow.allow_admin_edit,
        allowChildOverride: instRow.allow_child_override,
      }
    : DEFAULT_LOCKS;

  return {
    key: def.key as SettingKey,
    value: institutionValue,
    source: instRow ? "institution" : "default",
    institutionValue,
    hasClassOverride: false,
    institutionLocks: locks,
  };
}

/**
 * Resolve the effective value at the class scope (defaults → institution →
 * class), applying `def.clamp(child, parent)` when an override exists.
 */
export function mergeClassSetting<T>(
  def: SettingDefinition<T>,
  instRow: SettingRow | null,
  classRow: SettingRow | null
): EffectiveSetting<T> {
  const inst = mergeInstitutionSetting(def, instRow);
  if (!classRow) {
    return {
      ...inst,
      hasClassOverride: false,
    };
  }
  const rawChild = safeValidate(def, classRow.value, inst.institutionValue);
  const clamped = def.clamp ? def.clamp(rawChild, inst.institutionValue) : rawChild;
  // Clamping can produce an invalid value (e.g. empty array); re-validate.
  const safeChild = safeValidate(def, clamped, inst.institutionValue);

  return {
    key: def.key as SettingKey,
    value: safeChild,
    source: "class",
    institutionValue: inst.institutionValue,
    hasClassOverride: true,
    institutionLocks: inst.institutionLocks,
  };
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

function indexRows(rows: SettingRow[]): Map<string, SettingRow> {
  const out = new Map<string, SettingRow>();
  for (const row of rows) {
    if (!isKnownSettingKey(row.key)) continue;
    out.set(row.key, row);
  }
  return out;
}

/**
 * Resolve every registry entry visible at the institution scope.
 * Unknown DB rows (legacy keys) are skipped silently.
 */
export function buildInstitutionSettings(
  instRows: SettingRow[]
): Record<SettingKey, EffectiveSetting> {
  const byKey = indexRows(instRows);
  const out = {} as Record<SettingKey, EffectiveSetting>;
  for (const [key, def] of Object.entries(SETTINGS_REGISTRY) as [
    SettingKey,
    AnySettingDefinition,
  ][]) {
    if (!def.scopes.includes("institution")) continue;
    out[key] = mergeInstitutionSetting(def, byKey.get(key) ?? null);
  }
  return out;
}

/**
 * Resolve every registry entry visible at the class scope.
 */
export function buildClassSettings(
  instRows: SettingRow[],
  classRows: SettingRow[]
): Record<SettingKey, EffectiveSetting> {
  const instByKey = indexRows(instRows);
  const classByKey = indexRows(classRows);
  const out = {} as Record<SettingKey, EffectiveSetting>;
  for (const [key, def] of Object.entries(SETTINGS_REGISTRY) as [
    SettingKey,
    AnySettingDefinition,
  ][]) {
    if (!def.scopes.includes("class")) continue;
    out[key] = mergeClassSetting(
      def,
      instByKey.get(key) ?? null,
      classByKey.get(key) ?? null
    );
  }
  return out;
}

/** Convenience type — fully-resolved bundle for one scope. */
export type EffectiveSettings = Record<SettingKey, EffectiveSetting>;

/** Typed accessor that returns a strongly-typed value for a known key. */
export function getEffectiveValue<K extends SettingKey>(
  bundle: EffectiveSettings,
  key: K
): (typeof SETTINGS_REGISTRY)[K]["default"] {
  return bundle[key].value as (typeof SETTINGS_REGISTRY)[K]["default"];
}
