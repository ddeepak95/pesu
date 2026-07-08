import "server-only";

import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";
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
  classOverridePolicy: AiClassOverridePolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    institutionPolicy: input.institutionPolicy,
    classOverridePolicy: input.classOverridePolicy,
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
}): void {
  if (input.viewerRole !== "super_admin") {
    throw new Error("Only platform super admins may change this lock");
  }
}

/**
 * Toggling "allow this class's teachers to edit AI configuration": role
 * authority first, then the hierarchy rule. Turning it ON requires the
 * institution's admin-edit master lock — this applies to super admins too,
 * not just institution admins.
 */
export function assertCanToggleClassAiOverride(input: {
  viewerRole: ViewerRole;
  enabled: boolean;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canToggleClassAiOverride) {
    throw new Error("You may not change class override permission");
  }
  if (input.enabled && !input.institutionPolicy.allowAdminEdit) {
    throw new Error(
      'Enable "Allow institution admin to edit" before granting class teacher overrides',
    );
  }
}
