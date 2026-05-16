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
