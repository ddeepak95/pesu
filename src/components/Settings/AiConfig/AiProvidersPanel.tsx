"use client";

import { List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CATALOG_PROVIDERS } from "@/lib/ai/catalog/data";
import type { AiSettingsScope, LocalAiSettingsState, ProviderId } from "@/lib/ai/catalog/types";

import AiProviderCard from "./AiProviderCard";

interface AiProvidersPanelProps {
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  allowUsePlatformDefaults?: boolean;
  allowUseInstitutionDefault?: boolean;
  onActivate: (providerId: ProviderId, apiKey: string) => void;
  onDeactivate: (providerId: ProviderId) => void;
  onUsePlatformChange: (providerId: ProviderId, usePlatform: boolean) => void;
  onViewModels: () => void;
}

export default function AiProvidersPanel({
  scope,
  state,
  allowUsePlatformDefaults = true,
  allowUseInstitutionDefault = true,
  onActivate,
  onDeactivate,
  onUsePlatformChange,
  onViewModels,
}: AiProvidersPanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium">Providers</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={onViewModels}
            >
              <List className="mr-1.5 h-3.5 w-3.5" />
              View models
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Activate each provider with an API key. App functions can only use models
            from activated providers.
          </p>
        </div>
      </div>
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
