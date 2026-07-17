"use client";

import { useMemo, useState } from "react";
import { List } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAiCatalogSettings } from "@/hooks/swr/useAiCatalogSettings";
import {
  mergeClassProviderStateForCatalog,
  mergeInstitutionProviderStateForCatalog,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  ModelTask,
  ProviderId,
} from "@/lib/ai/catalog/types";
import {
  aiConfigCapabilities,
  type AiConfigCapabilities,
} from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import {
  DEFAULT_AI_INSTITUTION_POLICY,
  type AiClassOverridePolicy,
  type AiInstitutionPolicy,
} from "@/types/aiSettings";

import { CATALOG_PROVIDERS } from "@/lib/ai/catalog/data";

import AiChildOverrideDefaultRow from "./AiChildOverrideDefaultRow";
import AiConfigLocksRow from "./AiConfigLocksRow";
import AiFunctionsPanel from "./AiFunctionsPanel";
import AiModelCatalogDialog from "./AiModelCatalogDialog";
import type { InstitutionDefaultSource } from "./AiProviderCard";
import AiProvidersPanel from "./AiProvidersPanel";
import ClassAiOverrideRow from "./ClassAiOverrideRow";

interface AiSettingsPageContentProps {
  scope: AiSettingsScope;
  scopeId: string;
  institutionId?: string;
  title: string;
  description?: string;
  viewerRole?: ViewerRole;
  institutionPolicy?: AiInstitutionPolicy;
  classOverridePolicy?: AiClassOverridePolicy;
  classShortId?: string | null;
  showLocks?: boolean;
  /** Class scope only — the class's AI-access toggle (ai_class_settings.ai_access_enabled). Gates whether providers may fall back to the institution's key. */
  classAccessEnabled?: boolean;
}

export default function AiSettingsPageContent({
  scope,
  scopeId,
  institutionId,
  title,
  description,
  viewerRole = "super_admin",
  institutionPolicy,
  classOverridePolicy,
  classShortId,
  showLocks = false,
  classAccessEnabled = true,
}: AiSettingsPageContentProps) {
  const {
    state,
    platformState,
    institutionState,
    hydrated,
    isPending,
    error,
    activateProvider,
    deactivateProvider,
    setUsePlatformProvider,
    updateFunctionBinding,
    clearFunctionBinding,
    setUsePlatformFunctionDefault,
    resetToDefaults,
  } = useAiCatalogSettings(scope, scopeId, { institutionId });

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogProviderId, setCatalogProviderId] = useState<
    ProviderId | undefined
  >(undefined);
  const [catalogFilterTask, setCatalogFilterTask] = useState<
    ModelTask | undefined
  >(undefined);

  const openCatalog = (opts: {
    providerId?: ProviderId;
    task?: ModelTask;
  }) => {
    setCatalogProviderId(opts.providerId);
    setCatalogFilterTask(opts.task);
    setCatalogOpen(true);
  };

  const handleCatalogOpenChange = (open: boolean) => {
    setCatalogOpen(open);
    if (!open) {
      setCatalogProviderId(undefined);
      setCatalogFilterTask(undefined);
    }
  };

  const catalogState = useMemo(() => {
    if (scope === "class" && institutionState && platformState) {
      return mergeClassProviderStateForCatalog(
        state,
        institutionState,
        platformState,
      );
    }
    if (scope === "institution" && platformState) {
      return mergeInstitutionProviderStateForCatalog(state, platformState);
    }
    return state;
  }, [scope, state, platformState, institutionState]);

  // What "Institution Default" resolves to per provider at class scope —
  // institution BYOK when the institution has its own active key, otherwise
  // the platform's credit-metered key. Display-only: just the source enum
  // crosses into the card, never key material.
  const institutionDefaultSources = useMemo(() => {
    if (scope !== "class" || !institutionState || !platformState) {
      return undefined;
    }
    const map: Partial<Record<ProviderId, InstitutionDefaultSource>> = {};
    for (const provider of CATALOG_PROVIDERS) {
      const inst = institutionState.providers[provider.id];
      const plat = platformState.providers[provider.id];
      map[provider.id] =
        inst?.isActive && !inst.usePlatformDefault
          ? "institution"
          : plat?.isActive
            ? "platform"
            : "none";
    }
    return map;
  }, [scope, institutionState, platformState]);

  const highlightModelId =
    state.functions.text?.modelId ??
    institutionState?.functions.text?.modelId ??
    platformState?.functions.text?.modelId ??
    null;

  const canEditForScope = (caps: AiConfigCapabilities): boolean => {
    if (scope === "platform") return caps.canEditPlatform;
    if (scope === "institution") return caps.canEditInstitutionValue;
    return caps.canEditClassOverride;
  };

  const capabilityInput = {
    viewerRole,
    mode: scope,
    institutionPolicy: institutionPolicy ?? DEFAULT_AI_INSTITUTION_POLICY,
    classOverridePolicy,
  };
  const canEditProviders = canEditForScope(
    aiConfigCapabilities({ ...capabilityInput, section: "providers" }),
  );
  const canEditFunctions = canEditForScope(
    aiConfigCapabilities({ ...capabilityInput, section: "functions" }),
  );

  if (!hydrated) {
    return (
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {(isPending || error) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {isPending ? "Saving…" : null}
            {error ? (
              <span className="text-destructive">{error.message}</span>
            ) : null}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Providers</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={() => openCatalog({})}
            >
              <List className="mr-1.5 h-3.5 w-3.5" />
              View models
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showLocks && institutionPolicy && scope === "institution" && (
            <>
              <AiConfigLocksRow
                institutionId={scopeId}
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                section="providers"
              />
              <AiChildOverrideDefaultRow
                institutionId={scopeId}
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                section="providers"
              />
            </>
          )}

          {scope === "class" && institutionPolicy && classOverridePolicy && (
            <ClassAiOverrideRow
              classDbId={scopeId}
              classShortId={classShortId}
              viewerRole={viewerRole}
              institutionPolicy={institutionPolicy}
              classOverridePolicy={classOverridePolicy}
              section="providers"
            />
          )}

          <AiProvidersPanel
            scope={scope}
            state={state}
            allowUsePlatformDefaults={
              institutionPolicy?.allowUsePlatformDefaults ?? true
            }
            allowUseInstitutionDefault={classAccessEnabled}
            institutionDefaultSources={institutionDefaultSources}
            canEdit={canEditProviders}
            onActivate={activateProvider}
            onDeactivate={deactivateProvider}
            onUsePlatformChange={setUsePlatformProvider}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Model Selections</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || !canEditFunctions}
              onClick={() => resetToDefaults("functions")}
            >
              Reset to default
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showLocks && institutionPolicy && scope === "institution" && (
            <>
              <AiConfigLocksRow
                institutionId={scopeId}
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                section="functions"
              />
              <AiChildOverrideDefaultRow
                institutionId={scopeId}
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                section="functions"
              />
            </>
          )}

          {scope === "class" && institutionPolicy && classOverridePolicy && (
            <ClassAiOverrideRow
              classDbId={scopeId}
              classShortId={classShortId}
              viewerRole={viewerRole}
              institutionPolicy={institutionPolicy}
              classOverridePolicy={classOverridePolicy}
              section="functions"
            />
          )}

          <AiFunctionsPanel
            scope={scope}
            state={state}
            platformState={platformState}
            institutionState={institutionState}
            canEdit={canEditFunctions}
            allowUsePlatformDefaults={
              institutionPolicy?.allowUsePlatformDefaults ?? true
            }
            allowUseInstitutionDefault={classAccessEnabled}
            onBindingChange={updateFunctionBinding}
            onClearBinding={clearFunctionBinding}
            onUsePlatformFunctionDefault={setUsePlatformFunctionDefault}
            onBrowseCatalogForTask={(task) => openCatalog({ task })}
          />
        </CardContent>
      </Card>

      <AiModelCatalogDialog
        open={catalogOpen}
        onOpenChange={handleCatalogOpenChange}
        scope={scope}
        state={catalogState}
        providerId={catalogProviderId}
        catalogFilterTask={catalogFilterTask}
        highlightModelId={highlightModelId}
      />
    </div>
  );
}
