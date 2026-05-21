import "server-only";

import type { AIProvider, ResolvedModelConfig } from "@/lib/ai/config";
import {
  getDefaultProviderOptions,
  type ResolvedModelConfig as BaseResolvedModelConfig,
} from "@/lib/ai/config";
import {
  getCatalogEntry,
  isProviderConfigured,
} from "@/lib/prototype/konvo-voice/sessionCatalog";

export function resolvePrototypeModelConfig(
  catalogModelId: string,
): BaseResolvedModelConfig {
  const entry = getCatalogEntry(catalogModelId);
  if (!entry) {
    throw new Error(`Unknown catalog model: ${catalogModelId}`);
  }
  if (entry.status !== "available") {
    throw new Error(`Model "${catalogModelId}" is not available.`);
  }
  if (!isProviderConfigured(entry.providerId)) {
    throw new Error(
      `Provider "${entry.providerId}" is not configured. Set the API key in your environment.`,
    );
  }

  const provider = entry.providerId as AIProvider;
  if (provider !== "google" && provider !== "openai") {
    throw new Error(
      `Model "${catalogModelId}" uses provider "${entry.providerId}" which is not supported for LLM resolution.`,
    );
  }

  const modelId =
    entry.modelClass === "foundation" ? entry.id : entry.apiModelId ?? entry.id;

  let apiKey = "";
  if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY ?? "";
  } else {
    apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.GEMINI_API_KEY ??
      "";
  }

  if (!apiKey.trim()) {
    throw new Error(`Missing API key for provider "${provider}".`);
  }

  const config: ResolvedModelConfig = {
    provider,
    apiKey,
    modelId,
    providerOptions: getDefaultProviderOptions(provider),
  };

  return config;
}
