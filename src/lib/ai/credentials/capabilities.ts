import type { SettingCapabilities, ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

export function aiConfigCapabilities(input: {
  viewerRole: ViewerRole;
  mode: "platform" | "institution" | "class";
  institutionPolicy: AiInstitutionPolicy;
}): SettingCapabilities & {
  canEditPlatform: boolean;
  canToggleAllowPlatformDefaults: boolean;
} {
  const { viewerRole, mode, institutionPolicy } = input;

  if (viewerRole === "super_admin") {
    return {
      canEditInstitutionValue: mode === "institution",
      canToggleAllowAdminEdit: mode === "institution",
      canToggleAllowChildOverride: mode === "institution",
      canEditClassOverride: mode === "class",
      canClearClassOverride: mode === "class",
      canEditPlatform: mode === "platform",
      canToggleAllowPlatformDefaults: mode === "institution",
    };
  }

  if (viewerRole === "institution_admin") {
    return {
      canEditInstitutionValue:
        mode === "institution" && institutionPolicy.allowAdminEdit,
      canToggleAllowAdminEdit: false,
      canToggleAllowChildOverride:
        mode === "institution" && institutionPolicy.allowAdminEdit,
      // Institution admins manage `allowChildOverride` itself, so the lock
      // can't gate their own access — only class-level roles need it.
      canEditClassOverride: mode === "class",
      canClearClassOverride: mode === "class",
      canEditPlatform: false,
      canToggleAllowPlatformDefaults: false,
    };
  }

  if (
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin"
  ) {
    // Class teachers need both: the institution's admin-edit master lock on,
    // and the class-teacher sub-permission granted.
    const classTeacherEditable =
      mode === "class" &&
      institutionPolicy.allowAdminEdit &&
      institutionPolicy.allowChildOverride;
    return {
      canEditInstitutionValue: false,
      canToggleAllowAdminEdit: false,
      canToggleAllowChildOverride: false,
      canEditClassOverride: classTeacherEditable,
      canClearClassOverride: classTeacherEditable,
      canEditPlatform: false,
      canToggleAllowPlatformDefaults: false,
    };
  }

  return {
    canEditInstitutionValue: false,
    canToggleAllowAdminEdit: false,
    canToggleAllowChildOverride: false,
    canEditClassOverride: false,
    canClearClassOverride: false,
    canEditPlatform: false,
    canToggleAllowPlatformDefaults: false,
  };
}
