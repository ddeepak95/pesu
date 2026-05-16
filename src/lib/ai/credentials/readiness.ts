import type { AiInstitutionPolicy } from "@/types/aiSettings";

export interface AiConfigReadiness {
  showClassBanner: boolean;
  catalogConfigured: boolean;
  allowUsePlatformDefaults: boolean;
}

export function assessCatalogReadiness(input: {
  institutionPolicy: AiInstitutionPolicy;
  catalogConfigured: boolean;
}): AiConfigReadiness {
  const allowUsePlatformDefaults = input.institutionPolicy.allowUsePlatformDefaults;
  const showClassBanner =
    !allowUsePlatformDefaults && !input.catalogConfigured;

  return {
    showClassBanner,
    catalogConfigured: input.catalogConfigured,
    allowUsePlatformDefaults,
  };
}
