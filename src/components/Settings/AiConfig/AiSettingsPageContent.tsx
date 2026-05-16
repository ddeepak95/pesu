"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAiCatalogSettings } from "@/hooks/swr/useAiCatalogSettings";
import {
  buildEffectiveSummary,
  mergeClassProviderStateForCatalog,
  mergeInstitutionProviderStateForCatalog,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  ModelTask,
  ProviderId,
} from "@/lib/ai/catalog/types";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

import AiConfigLocksRow from "./AiConfigLocksRow";
import AiFunctionsPanel from "./AiFunctionsPanel";
import AiModelCatalogDialog from "./AiModelCatalogDialog";
import AiProvidersPanel from "./AiProvidersPanel";

interface AiSettingsPageContentProps {
  scope: AiSettingsScope;
  scopeId: string;
  institutionId?: string;
  title: string;
  description: string;
  viewerRole?: ViewerRole;
  institutionPolicy?: AiInstitutionPolicy;
  showLocks?: boolean;
}

export default function AiSettingsPageContent({
  scope,
  scopeId,
  institutionId,
  title,
  description,
  viewerRole = "super_admin",
  institutionPolicy,
  showLocks = false,
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

  const summary = useMemo(
    () =>
      buildEffectiveSummary(state, scope, {
        platform: platformState,
        institution: institutionState,
      }),
    [state, scope, platformState, institutionState],
  );

  const highlightModelId =
    state.functions.text?.modelId ??
    institutionState?.functions.text?.modelId ??
    platformState?.functions.text?.modelId ??
    null;

  if (!hydrated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
            <p className="mt-2 text-xs text-muted-foreground">
              Settings are saved to the database.
              {isPending ? " Saving…" : null}
              {error ? (
                <span className="text-destructive"> {error.message}</span>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={resetToDefaults}
          >
            Reset scope
          </Button>
        </div>
        {summary && (
          <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">Effective: </span>
            {summary}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-10">
        {showLocks && institutionPolicy && scope === "institution" && (
          <AiConfigLocksRow
            institutionId={scopeId}
            viewerRole={viewerRole}
            institutionPolicy={institutionPolicy}
          />
        )}

        <AiProvidersPanel
          scope={scope}
          state={state}
          onActivate={activateProvider}
          onDeactivate={deactivateProvider}
          onUsePlatformChange={setUsePlatformProvider}
          onViewModels={() => openCatalog({})}
        />

        <AiFunctionsPanel
          scope={scope}
          state={state}
          platformState={platformState}
          institutionState={institutionState}
          allowUsePlatformDefaults={
            institutionPolicy?.allowUsePlatformDefaults ?? true
          }
          onBindingChange={updateFunctionBinding}
          onClearBinding={clearFunctionBinding}
          onUsePlatformFunctionDefault={setUsePlatformFunctionDefault}
          onBrowseCatalogForTask={(task) => openCatalog({ task })}
        />

        <AiModelCatalogDialog
          open={catalogOpen}
          onOpenChange={handleCatalogOpenChange}
          scope={scope}
          state={catalogState}
          providerId={catalogProviderId}
          catalogFilterTask={catalogFilterTask}
          highlightModelId={highlightModelId}
        />
      </CardContent>
    </Card>
  );
}
