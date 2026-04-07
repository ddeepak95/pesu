/**
 * Language model factory.
 *
 * Accepts a ResolvedModelConfig and returns a LanguageModel instance from the
 * appropriate @ai-sdk/* provider. No process.env reads here — all config comes
 * from the caller (getDefaultModelConfigFromEnv() for default usage, or
 * user-supplied config for future BYOK flows).
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ResolvedModelConfig } from "./config";

export function getLanguageModel(config: ResolvedModelConfig): LanguageModelV3 {
  if (config.provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
    return google(config.modelId) as LanguageModelV3;
  }

  if (config.provider === "openai") {
    const openai = createOpenAI({ apiKey: config.apiKey });
    return openai(config.modelId) as LanguageModelV3;
  }

  throw new Error(`Unsupported provider: ${(config as ResolvedModelConfig).provider}`);
}
