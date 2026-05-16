import "server-only";

import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

import type { ResolvedModelConfig } from "@/lib/ai/config";
import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { parseAppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import {
  buildEffectiveCatalogRuntimeState,
  getProviderApiKey,
  resolveCatalogFunctionBinding,
} from "@/lib/ai/catalog/buildEffectiveRuntime";
import { getModelEntry } from "@/lib/ai/catalog/helpers";
import type { SavedModelReasoningConfig } from "@/lib/ai/catalog/types";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import { getCatalogSecretsForScope } from "@/lib/queries/aiCatalog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";

export interface ResolveCatalogModelConfigResult {
  config: ResolvedModelConfig & { providerOptions?: SharedV3ProviderOptions };
  keySource: AiConfigSource;
}

function reasoningToProviderOptions(
  reasoning: SavedModelReasoningConfig | undefined,
  provider: ResolvedModelConfig["provider"],
): SharedV3ProviderOptions | undefined {
  if (!reasoning) return undefined;
  if (reasoning.kind === "google" && provider === "google") {
    return {
      google: {
        thinkingConfig: {
          thinkingLevel: reasoning.thinkingLevel,
        },
      } satisfies GoogleLanguageModelOptions,
    };
  }
  if (reasoning.kind === "openai" && provider === "openai") {
    return {
      openai: {
        reasoningEffort: reasoning.reasoningEffort,
      } satisfies OpenAILanguageModelResponsesOptions,
    };
  }
  return undefined;
}

export function isCatalogConfiguredForClass(
  platform: ReturnType<typeof buildEffectiveCatalogRuntimeState>,
  binding: { providerId: string; modelId: string } | undefined,
): boolean {
  if (!binding) return false;
  const model = getModelEntry(binding.modelId);
  if (!model || model.status === "coming_soon") return false;
  const apiKey = getProviderApiKey(
    platform,
    binding.providerId as "google" | "openai",
  );
  return Boolean(apiKey);
}

/** Platform-only catalog resolve (e.g. teacher rubric generation without a class). */
export async function resolveCatalogModelConfigForPlatform(
  appFunctionKey: AppFunctionKey,
): Promise<ResolveCatalogModelConfigResult> {
  const service = createServiceRoleClient();
  const platformSecrets = await getCatalogSecretsForScope(
    service,
    "platform",
    PLATFORM_SCOPE_ID,
  );
  const runtime = buildEffectiveCatalogRuntimeState(platformSecrets, null, null);
  const { parentKey, subKey } = parseAppFunctionKey(appFunctionKey);
  const binding = resolveCatalogFunctionBinding(runtime, parentKey, subKey);
  if (!binding || !isCatalogConfiguredForClass(runtime, binding)) {
    throw new AiNotConfiguredError();
  }
  const apiKey = getProviderApiKey(runtime, binding.providerId);
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }
  return {
    config: {
      provider: binding.providerId,
      apiKey,
      modelId: binding.modelId,
      providerOptions: reasoningToProviderOptions(
        binding.reasoning,
        binding.providerId,
      ),
    },
    keySource: "platform",
  };
}

export async function resolveCatalogModelConfigForClass(input: {
  classDbId: string;
  institutionId: string | undefined;
  appFunctionKey: AppFunctionKey;
}): Promise<ResolveCatalogModelConfigResult> {
  const service = createServiceRoleClient();
  const { parentKey, subKey } = parseAppFunctionKey(input.appFunctionKey);

  const platformSecrets = await getCatalogSecretsForScope(
    service,
    "platform",
    PLATFORM_SCOPE_ID,
  );

  const institutionSecrets = input.institutionId
    ? await getCatalogSecretsForScope(
        service,
        "institution",
        input.institutionId,
      )
    : null;

  const classSecrets = await getCatalogSecretsForScope(
    service,
    "class",
    input.classDbId,
  );

  const runtime = buildEffectiveCatalogRuntimeState(
    platformSecrets,
    institutionSecrets,
    classSecrets,
  );

  const binding = resolveCatalogFunctionBinding(runtime, parentKey, subKey);
  if (!binding || !isCatalogConfiguredForClass(runtime, binding)) {
    throw new AiNotConfiguredError();
  }

  const apiKey = getProviderApiKey(runtime, binding.providerId);
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }

  const providerOptions = reasoningToProviderOptions(
    binding.reasoning,
    binding.providerId,
  );

  const usedClassBinding =
    subKey &&
    classSecrets.bindings.some((b) => b.binding_key === input.appFunctionKey);
  const usedClassParentBinding = classSecrets.bindings.some(
    (b) => b.binding_key === parentKey,
  );
  const usedClassProvider =
    classSecrets.providers.some(
      (p) =>
        p.provider_id === binding.providerId &&
        p.is_active &&
        !p.use_platform_default,
    ) ?? false;

  const usedInstitutionBinding =
    subKey &&
    (institutionSecrets?.bindings.some(
      (b) => b.binding_key === input.appFunctionKey,
    ) ??
      false);
  const usedInstitutionParentBinding =
    institutionSecrets?.bindings.some((b) => b.binding_key === parentKey) ??
    false;
  const usedInstitutionProvider =
    institutionSecrets?.providers.some(
      (p) =>
        p.provider_id === binding.providerId &&
        p.is_active &&
        !p.use_platform_default,
    ) ?? false;

  const keySource: AiConfigSource =
    usedClassBinding ||
    usedClassParentBinding ||
    usedClassProvider
      ? "class"
      : usedInstitutionBinding ||
          usedInstitutionParentBinding ||
          usedInstitutionProvider
        ? "institution"
        : "platform";

  return {
    config: {
      provider: binding.providerId,
      apiKey,
      modelId: binding.modelId,
      providerOptions,
    },
    keySource,
  };
}
