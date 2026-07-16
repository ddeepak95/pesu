"use client";

import { useCallback, useMemo, useTransition } from "react";
import useSWR, { mutate } from "swr";

import {
  activateCatalogProviderAction,
  clearCatalogFunctionBindingAction,
  deactivateCatalogProviderAction,
  loadCatalogSettingsAction,
  resetCatalogScopeAction,
  saveCatalogFunctionBindingAction,
  setCatalogUsePlatformFunctionDefaultAction,
  setCatalogUsePlatformProviderAction,
} from "@/lib/ai/catalog/actions";
import { CATALOG_FUNCTIONS } from "@/lib/ai/catalog/data";
import type {
  AiSettingsScope,
  FunctionBindingState,
  LocalAiSettingsState,
  ProviderId,
} from "@/lib/ai/catalog/types";
import { createDefaultLocalAiSettings } from "@/lib/ai/catalog/defaults";
import type { AiConfigSection } from "@/lib/ai/credentials/capabilities";

export const aiCatalogKeys = {
  scope: (scope: AiSettingsScope, scopeId: string) =>
    ["ai-catalog", scope, scopeId] as const,
};

export function invalidateAiCatalogCache(
  scope?: AiSettingsScope,
  scopeId?: string,
) {
  if (scope && scopeId) {
    return mutate(aiCatalogKeys.scope(scope, scopeId));
  }
  return mutate((key) => Array.isArray(key) && key[0] === "ai-catalog");
}

export function useAiCatalogSettings(
  scope: AiSettingsScope,
  scopeId: string,
  options?: { institutionId?: string },
) {
  const [isPending, startTransition] = useTransition();
  const institutionId = options?.institutionId;

  const { data, error, isLoading } = useSWR<LocalAiSettingsState>(
    aiCatalogKeys.scope(scope, scopeId),
    () => loadCatalogSettingsAction(scope, scopeId),
  );

  const needsPlatform = scope === "institution" || scope === "class";
  const needsInstitution = scope === "class" && Boolean(institutionId);

  const { data: platformData } = useSWR<LocalAiSettingsState>(
    needsPlatform ? aiCatalogKeys.scope("platform", "platform") : null,
    () => loadCatalogSettingsAction("platform", "platform"),
  );

  const { data: institutionData } = useSWR<LocalAiSettingsState>(
    needsInstitution && institutionId
      ? aiCatalogKeys.scope("institution", institutionId)
      : null,
    () => loadCatalogSettingsAction("institution", institutionId!),
  );

  const state = data ?? createDefaultLocalAiSettings(scope);
  const platformState = needsPlatform
    ? (platformData ?? createDefaultLocalAiSettings("platform"))
    : undefined;
  const institutionState =
    needsInstitution && institutionId
      ? (institutionData ?? createDefaultLocalAiSettings("institution"))
      : undefined;

  const parentFunctionState = useMemo(() => {
    if (scope === "institution") return platformState;
    if (scope === "class") return institutionState;
    return undefined;
  }, [scope, platformState, institutionState]);

  const hydrated =
    data !== undefined &&
    (!needsPlatform || platformData !== undefined) &&
    (!needsInstitution || institutionData !== undefined);

  const runMutation = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      const result = await fn();
      if (!result.ok) {
        throw new Error(result.error ?? "Save failed");
      }
      await invalidateAiCatalogCache(scope, scopeId);
    },
    [scope, scopeId],
  );

  const activateProvider = useCallback(
    (providerId: ProviderId, apiKey: string) => {
      startTransition(async () => {
        await runMutation(() =>
          activateCatalogProviderAction({ scope, scopeId, providerId, apiKey }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const deactivateProvider = useCallback(
    (providerId: ProviderId) => {
      startTransition(async () => {
        await runMutation(() =>
          deactivateCatalogProviderAction({ scope, scopeId, providerId }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const setUsePlatformProvider = useCallback(
    (providerId: ProviderId, usePlatform: boolean) => {
      startTransition(async () => {
        await runMutation(() =>
          setCatalogUsePlatformProviderAction({
            scope,
            scopeId,
            providerId,
            usePlatform,
          }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const updateFunctionBinding = useCallback(
    (fnKey: string, binding: FunctionBindingState) => {
      startTransition(async () => {
        await runMutation(() =>
          saveCatalogFunctionBindingAction({
            scope,
            scopeId,
            bindingKey: fnKey,
            binding,
          }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const clearFunctionBinding = useCallback(
    (fnKey: string) => {
      startTransition(async () => {
        await runMutation(() =>
          clearCatalogFunctionBindingAction({ scope, scopeId, bindingKey: fnKey }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const setUsePlatformFunctionDefault = useCallback(
    (parentKey: string, usePlatform: boolean) => {
      startTransition(async () => {
        await runMutation(() =>
          setCatalogUsePlatformFunctionDefaultAction({
            scope,
            scopeId,
            parentKey,
            usePlatform,
          }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  const resetToDefaults = useCallback(
    (section?: AiConfigSection) => {
      startTransition(async () => {
        await runMutation(() =>
          resetCatalogScopeAction({ scope, scopeId, section }),
        );
      });
    },
    [scope, scopeId, runMutation],
  );

  return {
    state,
    platformState,
    institutionState,
    parentFunctionState,
    hydrated,
    isLoading,
    isPending,
    error: error as Error | undefined,
    activateProvider,
    deactivateProvider,
    setUsePlatformProvider,
    updateFunctionBinding,
    clearFunctionBinding,
    setUsePlatformFunctionDefault,
    resetToDefaults,
    functionCatalog: CATALOG_FUNCTIONS,
  };
}
