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

const debugFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body) {
    try {
      const body = JSON.parse(init.body as string);
      console.log(
        "[ai-provider] raw request:",
        JSON.stringify(body, null, 2),
      );
    } catch {
      // non-JSON body, skip
    }
  }
  return globalThis.fetch(input, init);
};

const isDev = process.env.NODE_ENV !== "production";

export function getLanguageModel(config: ResolvedModelConfig): LanguageModelV3 {
  if (config.provider === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey,
      ...(isDev && { fetch: debugFetch }),
    });
    return google(config.modelId) as LanguageModelV3;
  }

  if (config.provider === "openai") {
    const openai = createOpenAI({
      apiKey: config.apiKey,
      ...(isDev && { fetch: debugFetch }),
    });
    return openai(config.modelId) as LanguageModelV3;
  }

  throw new Error(`Unsupported provider: ${(config as ResolvedModelConfig).provider}`);
}
