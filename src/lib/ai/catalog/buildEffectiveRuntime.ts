import "server-only";

import { CATALOG_PROVIDER_IDS } from "@/lib/ai/catalog/data";
import { createDefaultLocalAiSettings } from "@/lib/ai/catalog/defaults";
import { normalizeFunctionBinding, resolveFunctionBinding } from "@/lib/ai/catalog/helpers";
import type {
  FunctionBindingState,
  LocalAiSettingsState,
  ProviderId,
} from "@/lib/ai/catalog/types";
import { decryptApiKey } from "@/lib/ai/credentials/crypto";
import type {
  AiProviderActivationRow,
  CatalogScopeSecrets,
} from "@/types/aiCatalog";
import type { AiConfigSource } from "@/types/aiSettings";

export interface CatalogRuntimeState extends LocalAiSettingsState {
  /** Decrypted API keys for active providers (server-only). */
  providerApiKeys: Partial<Record<ProviderId, string>>;
  /** Which scope supplied the API key used at runtime (not the function binding). */
  providerApiKeySources: Partial<Record<ProviderId, AiConfigSource>>;
}

function decryptRowKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decryptApiKey(encrypted);
  } catch {
    return null;
  }
}

function bindingRowsToFunctions(
  rows: CatalogScopeSecrets["bindings"],
): Record<string, FunctionBindingState> {
  const functions: Record<string, FunctionBindingState> = {};
  for (const row of rows) {
    functions[row.binding_key] = normalizeFunctionBinding({
      providerId: row.provider_id,
      modelId: row.model_id,
      reasoning: row.reasoning_json ?? undefined,
    });
  }
  return functions;
}

function mergeProviderActivation(
  base: LocalAiSettingsState["providers"][ProviderId],
  scopeRow: AiProviderActivationRow | undefined,
  parentActive: { isActive: boolean; keyHint: string | null; apiKey: string | null },
  usePlatformDefault: boolean,
): { state: LocalAiSettingsState["providers"][ProviderId]; apiKey: string | null } {
  if (scopeRow && !scopeRow.use_platform_default) {
    const apiKey = decryptRowKey(scopeRow.encrypted_api_key);
    return {
      state: {
        isActive: scopeRow.is_active && Boolean(apiKey),
        apiKey: "",
        keyHint: scopeRow.key_hint,
        usePlatformDefault: false,
      },
      apiKey,
    };
  }

  return {
    state: {
      isActive: parentActive.isActive,
      apiKey: "",
      keyHint: parentActive.keyHint,
      usePlatformDefault,
    },
    apiKey: parentActive.apiKey,
  };
}

/**
 * Merge platform + institution + class catalog for class-level runtime resolve.
 */
export function buildEffectiveCatalogRuntimeState(
  platform: CatalogScopeSecrets,
  institution: CatalogScopeSecrets | null,
  classScope: CatalogScopeSecrets | null = null,
): CatalogRuntimeState {
  const base = createDefaultLocalAiSettings("institution");
  const providerApiKeys: Partial<Record<ProviderId, string>> = {};
  const providerApiKeySources: Partial<Record<ProviderId, AiConfigSource>> = {};

  for (const providerId of CATALOG_PROVIDER_IDS) {
    const platRow = platform.providers.find((r) => r.provider_id === providerId);
    const instRow = institution?.providers.find(
      (r) => r.provider_id === providerId,
    );
    const classRow = classScope?.providers.find(
      (r) => r.provider_id === providerId,
    );

    let platKey: string | null = null;
    let platActive = false;
    let platHint: string | null = null;
    if (platRow?.is_active) {
      platKey = decryptRowKey(platRow.encrypted_api_key);
      platActive = Boolean(platKey);
      platHint = platRow.key_hint;
    }

    const instMerged = mergeProviderActivation(
      base.providers[providerId],
      instRow,
      { isActive: platActive, keyHint: platHint, apiKey: platKey },
      Boolean(instRow?.use_platform_default ?? true),
    );

    const classMerged = mergeProviderActivation(
      instMerged.state,
      classRow,
      {
        isActive: instMerged.state.isActive,
        keyHint: instMerged.state.keyHint,
        apiKey: instMerged.apiKey,
      },
      Boolean(classRow?.use_platform_default ?? true),
    );

    base.providers[providerId] = classMerged.state;
    const key =
      classMerged.apiKey ?? instMerged.apiKey ?? platKey;

    let keySource: AiConfigSource = "platform";
    const classCustomKey =
      classRow?.is_active && !classRow.use_platform_default
        ? decryptRowKey(classRow.encrypted_api_key)
        : null;
    if (classCustomKey) {
      keySource = "class";
    } else {
      const instCustomKey =
        instRow?.is_active && !instRow.use_platform_default
          ? decryptRowKey(instRow.encrypted_api_key)
          : null;
      if (instCustomKey) {
        keySource = "institution";
      }
    }

    if (key && classMerged.state.isActive) {
      providerApiKeys[providerId] = key;
      providerApiKeySources[providerId] = keySource;
    }
  }

  const functions = {
    ...bindingRowsToFunctions(platform.bindings),
    ...(institution ? bindingRowsToFunctions(institution.bindings) : {}),
    ...(classScope ? bindingRowsToFunctions(classScope.bindings) : {}),
  };

  return {
    providers: base.providers,
    functions,
    providerApiKeys,
    providerApiKeySources,
  };
}

export function getProviderApiKey(
  state: CatalogRuntimeState,
  providerId: ProviderId,
): string | null {
  return state.providerApiKeys[providerId] ?? null;
}

export function getProviderApiKeySource(
  state: CatalogRuntimeState,
  providerId: ProviderId,
): AiConfigSource {
  return state.providerApiKeySources[providerId] ?? "platform";
}

export function resolveCatalogFunctionBinding(
  state: CatalogRuntimeState,
  parentKey: string,
  subKey?: string,
): FunctionBindingState | undefined {
  return resolveFunctionBinding(state, parentKey, subKey);
}
