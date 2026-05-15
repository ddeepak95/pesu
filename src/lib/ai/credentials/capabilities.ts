import type { SettingCapabilities, ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiCapabilityConfig";

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
      canEditClassOverride:
        mode === "class" && institutionPolicy.allowChildOverride,
      canClearClassOverride:
        mode === "class" && institutionPolicy.allowChildOverride,
      canEditPlatform: false,
      canToggleAllowPlatformDefaults: false,
    };
  }

  if (
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin"
  ) {
    return {
      canEditInstitutionValue: false,
      canToggleAllowAdminEdit: false,
      canToggleAllowChildOverride: false,
      canEditClassOverride:
        mode === "class" && institutionPolicy.allowChildOverride,
      canClearClassOverride:
        mode === "class" && institutionPolicy.allowChildOverride,
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
