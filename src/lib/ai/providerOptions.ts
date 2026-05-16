import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import type { ResolvedModelConfig } from "@/lib/ai/config";
import { getDefaultProviderOptions } from "@/lib/ai/config";

export function providerOptionsForConfig(
  config: ResolvedModelConfig,
): SharedV3ProviderOptions {
  return config.providerOptions ?? getDefaultProviderOptions(config.provider);
}

/** Dev-friendly reasoning label from resolved catalog or env defaults. */
export function formatReasoningForConfig(
  config: ResolvedModelConfig,
): string | null {
  const opts = providerOptionsForConfig(config);
  if (config.provider === "google") {
    const google = opts.google as GoogleLanguageModelOptions | undefined;
    return google?.thinkingConfig?.thinkingLevel ?? null;
  }
  const openai = opts.openai as OpenAILanguageModelResponsesOptions | undefined;
  return openai?.reasoningEffort ?? null;
}
