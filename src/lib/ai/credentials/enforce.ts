import "server-only";

import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { AiConfigSection } from "@/lib/ai/credentials/capabilities";
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
  section: AiConfigSection;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "institution",
    section: input.section,
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canEditInstitutionValue) {
    throw new Error(
      `You may not edit AI ${input.section} configuration for this institution`,
    );
  }
}

export function assertCanEditClassAiConfig(input: {
  viewerRole: ViewerRole;
  section: AiConfigSection;
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy: AiClassOverridePolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    section: input.section,
    institutionPolicy: input.institutionPolicy,
    classOverridePolicy: input.classOverridePolicy,
  });
  if (!caps.canEditClassOverride) {
    throw new Error(
      `You may not override AI ${input.section} configuration for this class`,
    );
  }
}

/**
 * Institution-scope providers may only fall back to the platform key when the
 * platform has granted `allow_use_platform_defaults`. Class scope is exempt —
 * a class inheriting its *institution's* key is governed by
 * `allow_child_override_providers`, not this lock.
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
 * Toggling "allow this class's teachers to edit AI configuration" for a
 * given section: role authority first, then the hierarchy rule. Turning it
 * ON requires the institution's admin-edit master lock for that same
 * section — this applies to super admins too, not just institution admins.
 */
export function assertCanToggleClassAiOverride(input: {
  viewerRole: ViewerRole;
  section: AiConfigSection;
  enabled: boolean;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    section: input.section,
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canToggleClassAiOverride) {
    throw new Error("You may not change class override permission");
  }
  const institutionAdminEditAllowed =
    input.section === "providers"
      ? input.institutionPolicy.allowAdminEditProviders
      : input.institutionPolicy.allowAdminEditFunctions;
  if (input.enabled && !institutionAdminEditAllowed) {
    throw new Error(
      `Enable "Allow institution admin to edit ${input.section}" before granting class teacher overrides`,
    );
  }
}

/**
 * Clearing a class's explicit override back to inheriting the institution
 * default is the same authority as setting it — institution admin (when the
 * admin-edit master lock is on) or super admin.
 */
export function assertCanClearClassAiOverride(input: {
  viewerRole: ViewerRole;
  section: AiConfigSection;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "class",
    section: input.section,
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canToggleClassAiOverride) {
    throw new Error("You may not change class override permission");
  }
}

/**
 * Toggling the institution-wide default_allow_child_override_* used as the
 * fallback for any class with no explicit per-class override: institution
 * admin (when the admin-edit master lock is on for that section) or super
 * admin — same authority as granting a single class's override.
 */
export function assertCanToggleDefaultChildOverride(input: {
  viewerRole: ViewerRole;
  section: AiConfigSection;
  institutionPolicy: AiInstitutionPolicy;
}): void {
  const caps = aiConfigCapabilities({
    viewerRole: input.viewerRole,
    mode: "institution",
    section: input.section,
    institutionPolicy: input.institutionPolicy,
  });
  if (!caps.canToggleDefaultChildOverride) {
    throw new Error(
      `Enable "Allow institution admin to edit ${input.section}" before setting a class default`,
    );
  }
}
