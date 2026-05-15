import "server-only";

import type { AiProvider } from "@/lib/ai/capabilities/registry";
import { AI_PROVIDERS, asAiCapabilityKey } from "@/lib/ai/capabilities/registry";
import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type {
  AiInstitutionPolicy,
  UpsertAiConfigPayload,
} from "@/types/aiCapabilityConfig";
import type { InstitutionAiConfigLockKey } from "@/lib/queries/aiCapabilityConfigs";

function assertProvider(raw: unknown): AiProvider {
  const allowed = new Set(AI_PROVIDERS.map((p) => p.value));
  if (typeof raw !== "string" || !allowed.has(raw as AiProvider)) {
    throw new Error("Invalid AI provider");
  }
  return raw as AiProvider;
}

export function validateUpsertPayload(
  capabilityKey: string,
  payload: UpsertAiConfigPayload,
  institutionPolicy?: AiInstitutionPolicy,
): UpsertAiConfigPayload {
  asAiCapabilityKey(capabilityKey);
  if (payload.usePlatformDefault) {
    if (
      institutionPolicy &&
      !institutionPolicy.allowUsePlatformDefaults
    ) {
      throw new Error(
        "Platform defaults are disabled for this institution. Configure custom API keys.",
      );
    }
    return { usePlatformDefault: true };
  }
  if (!payload.provider) {
    throw new Error("Provider is required for custom configuration");
  }
  return {
    usePlatformDefault: false,
    provider: assertProvider(payload.provider),
    modelId: payload.modelId?.trim() || undefined,
    apiKey: payload.apiKey?.trim() || undefined,
  };
}

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
  lock: InstitutionAiConfigLockKey;
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
