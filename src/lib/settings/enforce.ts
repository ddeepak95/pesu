/**
 * Server-side enforcement helpers — combine the registry validator with the
 * capabilities matrix so write paths cannot silently bypass either.
 *
 * The DB lock trigger (`setting_values_enforce_locks`) is the final
 * authority; these helpers just give actions a clean way to reject early
 * with a sensible error before round-tripping to Postgres.
 */
import {
  type SettingDefinition,
  type SettingKey,
  getSettingDefinition,
} from "./registry";
import type { InstitutionLocks } from "./resolve";
import {
  settingCapabilities,
  type ViewerRole,
} from "./capabilities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = SettingDefinition<any>;

export class SettingPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingPermissionError";
  }
}

export class SettingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingValidationError";
  }
}

interface AssertInstitutionWriteArgs {
  key: SettingKey;
  rawValue: unknown;
  viewerRole: ViewerRole;
  institutionLocks: InstitutionLocks;
}

/**
 * Returns the validated value when the viewer may write it; throws otherwise.
 */
export function assertCanWriteInstitutionValue<TValue>({
  key,
  rawValue,
  viewerRole,
  institutionLocks,
}: AssertInstitutionWriteArgs): TValue {
  const def = getSettingDefinition(key) as AnyDef;
  const caps = settingCapabilities({
    viewerRole,
    definition: def,
    institutionLocks,
  });
  if (!caps.canEditInstitutionValue) {
    throw new SettingPermissionError(
      `Not permitted to edit institution setting "${key}"`
    );
  }
  try {
    return def.validate(rawValue) as TValue;
  } catch (err) {
    throw new SettingValidationError((err as Error).message);
  }
}

interface AssertClassWriteArgs {
  key: SettingKey;
  rawValue: unknown;
  viewerRole: ViewerRole;
  institutionLocks: InstitutionLocks;
}

export function assertCanWriteClassOverride<TValue>({
  key,
  rawValue,
  viewerRole,
  institutionLocks,
}: AssertClassWriteArgs): TValue {
  const def = getSettingDefinition(key) as AnyDef;
  const caps = settingCapabilities({
    viewerRole,
    definition: def,
    institutionLocks,
  });
  if (!caps.canEditClassOverride) {
    throw new SettingPermissionError(
      `Not permitted to override class setting "${key}"`
    );
  }
  try {
    return def.validate(rawValue) as TValue;
  } catch (err) {
    throw new SettingValidationError((err as Error).message);
  }
}

interface AssertLockToggleArgs {
  key: SettingKey;
  lock: "allow_admin_edit" | "allow_child_override";
  viewerRole: ViewerRole;
  institutionLocks: InstitutionLocks;
}

export function assertCanToggleLock({
  key,
  lock,
  viewerRole,
  institutionLocks,
}: AssertLockToggleArgs): void {
  const def = getSettingDefinition(key) as AnyDef;
  const caps = settingCapabilities({
    viewerRole,
    definition: def,
    institutionLocks,
  });
  const permitted =
    lock === "allow_admin_edit"
      ? caps.canToggleAllowAdminEdit
      : caps.canToggleAllowChildOverride;
  if (!permitted) {
    throw new SettingPermissionError(
      `Not permitted to toggle "${lock}" on setting "${key}"`
    );
  }
}
