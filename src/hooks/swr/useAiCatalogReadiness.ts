"use client";

import useSWR from "swr";

import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";
import {
  mergeClassProviderStateForCatalog,
  resolveClassEffectiveFunctionBinding,
} from "@/lib/ai/catalog/helpers";
import { assessCatalogReadiness } from "@/lib/ai/credentials/readiness";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import { createClient } from "@/lib/supabase";
import { getCatalogSettingsForScope } from "@/lib/queries/aiCatalog";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import type { AiConfigReadiness } from "@/lib/ai/credentials/readiness";

export function useAiCatalogReadiness(
  classDbId: string | null,
  institutionId: string | null,
) {
  return useSWR<AiConfigReadiness>(
    classDbId && institutionId
      ? (["ai-catalog-readiness", classDbId, institutionId] as const)
      : null,
    async () => {
      const supabase = createClient();
      const [institutionPolicy, platform, institution, classState] =
        await Promise.all([
          getInstitutionAiPolicy(supabase, institutionId!),
          getCatalogSettingsForScope(supabase, "platform", PLATFORM_SCOPE_ID),
          getCatalogSettingsForScope(supabase, "institution", institutionId!),
          getCatalogSettingsForScope(supabase, "class", classDbId!),
        ]);

      const merged = mergeClassProviderStateForCatalog(
        classState,
        institution,
        platform,
      );
      const binding = resolveClassEffectiveFunctionBinding(
        classState,
        institution,
        platform,
        TEXT_CAPABILITY_KEY,
      );
      const catalogConfigured = Boolean(
        binding &&
          merged.providers[binding.providerId]?.isActive &&
          merged.providers[binding.providerId]?.keyHint,
      );

      return assessCatalogReadiness({ institutionPolicy, catalogConfigured });
    },
  );
}
