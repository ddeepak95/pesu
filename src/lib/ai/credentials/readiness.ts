import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";
import type {
  AiConfigReadiness,
  AiInstitutionPolicy,
  EffectiveAiConfigs,
} from "@/types/aiCapabilityConfig";

export function assessAiConfigReadiness(input: {
  institutionPolicy: AiInstitutionPolicy;
  platform: EffectiveAiConfigs;
  classEffective: EffectiveAiConfigs;
}): AiConfigReadiness {
  const textMeta = input.platform.capabilities[TEXT_CAPABILITY_KEY];
  const classTextMeta = input.classEffective.capabilities[TEXT_CAPABILITY_KEY];
  const platformConfigured = Boolean(textMeta?.hasKey);
  const classReady = Boolean(classTextMeta?.hasKey);
  const allowUsePlatformDefaults = input.institutionPolicy.allowUsePlatformDefaults;

  // When platform defaults are disabled, platform keys are not inherited — only
  // classReady matters. Requiring !platformConfigured hid the banner while platform
  // still had keys the institution could not use.
  const showClassBanner = !allowUsePlatformDefaults && !classReady;

  return {
    showClassBanner,
    platformConfigured,
    classReady,
    allowUsePlatformDefaults,
  };
}
