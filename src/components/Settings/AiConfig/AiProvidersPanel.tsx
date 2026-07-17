"use client";

import { CATALOG_PROVIDERS } from "@/lib/ai/catalog/data";
import type { AiSettingsScope, LocalAiSettingsState, ProviderId } from "@/lib/ai/catalog/types";

import AiProviderCard, {
  type InstitutionDefaultSource,
} from "./AiProviderCard";

interface AiProvidersPanelProps {
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  allowUsePlatformDefaults?: boolean;
  allowUseInstitutionDefault?: boolean;
  /** Class scope only — per provider, what "Institution Default" resolves to. */
  institutionDefaultSources?: Partial<Record<ProviderId, InstitutionDefaultSource>>;
  /** Whether the viewer may edit provider config. When false, all controls render read-only. */
  canEdit?: boolean;
  onActivate: (providerId: ProviderId, apiKey: string) => void;
  onDeactivate: (providerId: ProviderId) => void;
  onUsePlatformChange: (providerId: ProviderId, usePlatform: boolean) => void;
}

export default function AiProvidersPanel({
  scope,
  state,
  allowUsePlatformDefaults = true,
  allowUseInstitutionDefault = true,
  institutionDefaultSources,
  canEdit = true,
  onActivate,
  onDeactivate,
  onUsePlatformChange,
}: AiProvidersPanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4">
        {CATALOG_PROVIDERS.map((provider) => {
          const activation = state.providers[provider.id];
          return (
            <AiProviderCard
              key={provider.id}
              provider={provider}
              scope={scope}
              activation={activation}
              allowUsePlatformDefaults={allowUsePlatformDefaults}
              allowUseInstitutionDefault={allowUseInstitutionDefault}
              institutionDefaultSource={institutionDefaultSources?.[provider.id]}
              canEdit={canEdit}
              onActivate={(key) => onActivate(provider.id, key)}
              onDeactivate={() => onDeactivate(provider.id)}
              onUsePlatformChange={(usePlatform) =>
                onUsePlatformChange(provider.id, usePlatform)
              }
            />
          );
        })}
      </div>
    </section>
  );
}
