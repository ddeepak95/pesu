import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";

export interface AiConfigCapabilities {
  /** Can the viewer edit the institution-scope value? */
  canEditInstitutionValue: boolean;
  /** Can the viewer flip allow_admin_edit (only super_admin)? */
  canToggleAllowAdminEdit: boolean;
  /** Can the viewer create or update a class-scope override? */
  canEditClassOverride: boolean;
  /** Can the viewer clear a class-scope override back to inherited? */
  canClearClassOverride: boolean;
  /** Can the viewer edit the platform-scope value (only super_admin)? */
  canEditPlatform: boolean;
  /** Can the viewer flip allow_use_platform_defaults (only super_admin)? */
  canToggleAllowPlatformDefaults: boolean;
  /** Can the viewer toggle whether a specific class's teachers may edit AI config? */
  canToggleClassAiOverride: boolean;
}

export function aiConfigCapabilities(input: {
  viewerRole: ViewerRole;
  mode: "platform" | "institution" | "class";
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy?: AiClassOverridePolicy;
}): AiConfigCapabilities {
  const { viewerRole, mode, institutionPolicy, classOverridePolicy } = input;

  if (viewerRole === "super_admin") {
    return {
      canEditInstitutionValue: mode === "institution",
      canToggleAllowAdminEdit: mode === "institution",
      canEditClassOverride: mode === "class",
      canClearClassOverride: mode === "class",
      canEditPlatform: mode === "platform",
      canToggleAllowPlatformDefaults: mode === "institution",
      canToggleClassAiOverride: mode === "class",
    };
  }

  if (viewerRole === "institution_admin") {
    return {
      canEditInstitutionValue:
        mode === "institution" && institutionPolicy.allowAdminEdit,
      canToggleAllowAdminEdit: false,
      // Institution admins manage the per-class override flag itself, so
      // it can't gate their own access — only class-level roles need it.
      canEditClassOverride: mode === "class",
      canClearClassOverride: mode === "class",
      canEditPlatform: false,
      canToggleAllowPlatformDefaults: false,
      canToggleClassAiOverride: mode === "class" && institutionPolicy.allowAdminEdit,
    };
  }

  if (
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin"
  ) {
    // Class teachers need both: the institution's admin-edit master lock on,
    // and this specific class's override permission granted.
    const classTeacherEditable =
      mode === "class" &&
      institutionPolicy.allowAdminEdit &&
      (classOverridePolicy?.allowChildOverride ?? false);
    return {
      canEditInstitutionValue: false,
      canToggleAllowAdminEdit: false,
      canEditClassOverride: classTeacherEditable,
      canClearClassOverride: classTeacherEditable,
      canEditPlatform: false,
      canToggleAllowPlatformDefaults: false,
      canToggleClassAiOverride: false,
    };
  }

  return {
    canEditInstitutionValue: false,
    canToggleAllowAdminEdit: false,
    canEditClassOverride: false,
    canClearClassOverride: false,
    canEditPlatform: false,
    canToggleAllowPlatformDefaults: false,
    canToggleClassAiOverride: false,
  };
}
