import "server-only";

import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";
import type { InstitutionAiPolicyLockKey } from "@/lib/queries/aiInstitutionSettings";

export function assertCanEditPlatform(viewerRole: ViewerRole): void {
  if (viewerRole !== "super_admin") {
    throw new Error("Only platform super admins may edit platform AI defaults");
  }
}

export function assertCanEditInstitutionAiConfig(input: {
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "institution",
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canEditInstitutionValue) {
    throw new Error("You may not edit AI configuration for this institution");
  }
}

export function assertCanEditClassAiConfig(input: {
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canEditClassOverride) {
    throw new Error("You may not override AI configuration for this class");
  }
}

/**
 * Institution-scope providers may only fall back to the platform key when the
 * platform has granted `allow_use_platform_defaults`. Class scope is exempt —
 * a class inheriting its *institution's* key is governed by
 * `allow_child_override`, not this lock.
 */
export function assertCanUsePlatformDefault(input: {
  scope: "institution" | "class";
  usePlatform: boolean;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  if (input.scope !== "institution" || !input.usePlatform) return;
  if (!input.institutionPolicy.allowUsePlatformDefaults) {
    throw new Error(
      "This institution is not allowed to use platform default keys",
    );
  }
}

export function assertCanToggleAiLock(input: {
  viewerRole: ViewerRole;
  lock: InstitutionAiPolicyLockKey;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  if (input.viewerRole === "super_admin") return;
  if (
    input.lock === "allow_admin_edit" ||
    input.lock === "allow_use_platform_defaults"
  ) {
    throw new Error("Only platform super admins may change this lock");
  }
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "institution",
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canToggleAllowChildOverride) {
    throw new Error("You may not change class override permission");
  }
}
