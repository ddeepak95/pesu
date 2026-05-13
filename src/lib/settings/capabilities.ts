/**
 * Capabilities matrix — single source of truth for who can do what on a
 * setting. Used by both the UI (to hide/disable controls) and server actions
 * (to refuse forbidden writes), guaranteeing the two stay in sync.
 *
 *   Viewer role          | Edit inst value | Toggle adminEdit | Toggle childOverride | Edit class override
 *   ---------------------|-----------------|------------------|----------------------|--------------------
 *   super_admin          | always          | always           | always               | always (when scope=class)
 *   institution_admin    | iff adminEdit   | never            | iff adminEdit        | iff childOverride
 *   class_owner          | never           | never            | never                | iff childOverride
 *   viewer               | never           | never            | never                | never
 *
 * Note: `adminEdit` (super-admin-controlled) is the master gate for the
 * institution admin's authority on a row. When `adminEdit` is off, the
 * institution admin can neither change the value nor flip `childOverride`,
 * so super admins can fully lock a setting at the institution level without
 * leaving a back door for class-level overrides.
 */
import type { AnySettingDefinition } from "./registry";
import type { InstitutionLocks } from "./resolve";

export type ViewerRole =
  | "super_admin"
  | "institution_admin"
  | "class_owner"
  | "viewer";

export interface SettingCapabilities {
  /** Can the viewer edit the institution-scope `value`? */
  canEditInstitutionValue: boolean;
  /** Can the viewer flip `allow_admin_edit` (only super_admin)? */
  canToggleAllowAdminEdit: boolean;
  /** Can the viewer flip `allow_child_override`? */
  canToggleAllowChildOverride: boolean;
  /** Can the viewer create or update a class-scope override? */
  canEditClassOverride: boolean;
  /** Can the viewer clear a class-scope override back to inherited? */
  canClearClassOverride: boolean;
}

export interface CapabilityInput {
  viewerRole: ViewerRole;
  definition: AnySettingDefinition;
  institutionLocks: InstitutionLocks;
}

/**
 * Pure: compute the capability bundle for one setting + viewer.
 * The same function is reused by every UI panel and every server action.
 */
export function settingCapabilities({
  viewerRole,
  definition,
  institutionLocks,
}: CapabilityInput): SettingCapabilities {
  const institutionEditable = definition.scopes.includes("institution");
  const classEditable = definition.scopes.includes("class");

  if (viewerRole === "super_admin") {
    return {
      canEditInstitutionValue: institutionEditable,
      canToggleAllowAdminEdit: institutionEditable,
      canToggleAllowChildOverride: institutionEditable,
      canEditClassOverride: classEditable,
      canClearClassOverride: classEditable,
    };
  }

  if (viewerRole === "institution_admin") {
    return {
      canEditInstitutionValue:
        institutionEditable && institutionLocks.allowAdminEdit,
      canToggleAllowAdminEdit: false,
      // `allow_child_override` is gated by `allowAdminEdit` so super admins
      // can fully lock a setting at the institution level: if the institution
      // admin can't edit the value, they also can't grant class admins the
      // right to override it.
      canToggleAllowChildOverride:
        institutionEditable && institutionLocks.allowAdminEdit,
      canEditClassOverride:
        classEditable && institutionLocks.allowChildOverride,
      canClearClassOverride:
        classEditable && institutionLocks.allowChildOverride,
    };
  }

  if (viewerRole === "class_owner") {
    return {
      canEditInstitutionValue: false,
      canToggleAllowAdminEdit: false,
      canToggleAllowChildOverride: false,
      canEditClassOverride:
        classEditable && institutionLocks.allowChildOverride,
      canClearClassOverride:
        classEditable && institutionLocks.allowChildOverride,
    };
  }

  return {
    canEditInstitutionValue: false,
    canToggleAllowAdminEdit: false,
    canToggleAllowChildOverride: false,
    canEditClassOverride: false,
    canClearClassOverride: false,
  };
}
