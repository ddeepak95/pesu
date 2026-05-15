import useSWR, { mutate } from "swr";

import { createClient } from "@/lib/supabase";
import {
  getClassAiConfigs,
  getInstitutionAiConfigs,
  getPlatformAiConfigs,
} from "@/lib/queries/aiCapabilityConfigs";
import type { AiConfigScope } from "@/lib/ai/credentials/constants";
import { assessAiConfigReadiness } from "@/lib/ai/credentials/readiness";
import type {
  AiConfigReadiness,
  EffectiveAiConfigs,
} from "@/types/aiCapabilityConfig";

export const aiCapabilityConfigKeys = {
  platform: () => ["ai-capability-config", "platform"] as const,
  institution: (id: string) => ["ai-capability-config", "institution", id] as const,
  class: (id: string) => ["ai-capability-config", "class", id] as const,
};

function invalidateAiConfigReadinessCache() {
  return mutate(
    (key) => Array.isArray(key) && key[0] === "ai-capability-readiness",
  );
}

export function invalidateAiConfigCache(
  scope?: AiConfigScope,
  scopeId?: string,
) {
  const readinessInvalidation = invalidateAiConfigReadinessCache();
  if (!scope) {
    return Promise.all([
      mutate((key) => Array.isArray(key) && key[0] === "ai-capability-config"),
      readinessInvalidation,
    ]);
  }
  if (scope === "platform") {
    return Promise.all([
      mutate(aiCapabilityConfigKeys.platform()),
      readinessInvalidation,
    ]);
  }
  if (scopeId) {
    return Promise.all([
      mutate(
        scope === "institution"
          ? aiCapabilityConfigKeys.institution(scopeId)
          : aiCapabilityConfigKeys.class(scopeId),
      ),
      readinessInvalidation,
    ]);
  }
  return Promise.all([
    mutate((key) => Array.isArray(key) && key[0] === "ai-capability-config"),
    readinessInvalidation,
  ]);
}

export function usePlatformAiConfigs() {
  return useSWR<EffectiveAiConfigs>(aiCapabilityConfigKeys.platform(), () =>
    getPlatformAiConfigs(createClient()),
  );
}

export function useInstitutionAiConfigs(institutionId: string | null) {
  return useSWR<EffectiveAiConfigs>(
    institutionId ? aiCapabilityConfigKeys.institution(institutionId) : null,
    () => getInstitutionAiConfigs(createClient(), institutionId!),
  );
}

export function useClassAiConfigs(classDbId: string | null) {
  return useSWR<EffectiveAiConfigs>(
    classDbId ? aiCapabilityConfigKeys.class(classDbId) : null,
    () => getClassAiConfigs(createClient(), classDbId!),
  );
}

export function useAiConfigReadiness(
  classDbId: string | null,
  institutionId: string | null,
) {
  return useSWR<AiConfigReadiness>(
    classDbId && institutionId
      ? (["ai-capability-readiness", classDbId, institutionId] as const)
      : null,
    async () => {
      const supabase = createClient();
      const [platform, classEffective] = await Promise.all([
        getPlatformAiConfigs(supabase),
        getClassAiConfigs(supabase, classDbId!),
      ]);
      return assessAiConfigReadiness({
        institutionPolicy: classEffective.institutionPolicy,
        platform,
        classEffective,
      });
    },
  );
}
