/**
 * AI provider configuration.
 *
 * Reading env is centralised here so that getLanguageModel() stays pure
 * (no process.env reads inside the factory). Future BYOK flows resolve a
 * ResolvedModelConfig from DB/session and pass it directly to getLanguageModel().
 *
 * Environment variables:
 *   AI_PROVIDER          - "google" (default) | "openai"
 *   GEMINI_MODEL         - optional model override (default: gemini-3-flash-preview)
 *   OPENAI_MODEL         - optional model override (default: gpt-5.1-mini)
 *   GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY  - Google provider key
 *   OPENAI_API_KEY       - OpenAI provider key (when AI_PROVIDER=openai)
 */

import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

export type AIProvider = "google" | "openai";

export interface ResolvedModelConfig {
  provider: AIProvider;
  apiKey: string;
  modelId: string;
  providerOptions?: SharedV3ProviderOptions;
}

/**
 * Returns default providerOptions for the given provider.
 *
 * Google (Gemini 3): thinkingLevel "minimal" — near-zero latency, model may
 *   still think for complex coding tasks.
 * OpenAI: reasoning.effort (e.g. gpt-5.4: none, low, medium, high, xhigh).
 *
 * `strictJsonSchema: false` (OpenAI): the SDK defaults structured outputs to
 * OpenAI's strict JSON-schema mode, which requires EVERY property to appear in
 * `required` and rejects any Zod `.optional()`/`.default()` field (e.g. the MCQ
 * action's `difficulty`/`guidance`, or eval schemas) with a hard 400
 * `invalid_json_schema`. Gemini is lax about this, so schemas authored against
 * it break only on OpenAI. Disabling strict mode makes OpenAI best-effort like
 * Gemini; the AI SDK still validates output against the Zod schema and retries,
 * so conformance is preserved without contorting every schema to be
 * strict-compatible.
 */
export function getDefaultProviderOptions(
  provider: AIProvider,
): SharedV3ProviderOptions {
  if (provider === "google") {
    return {
      google: {
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      } satisfies GoogleLanguageModelOptions,
    };
  }
  if (provider === "openai") {
    return {
      openai: {
        reasoningEffort: "low",
        strictJsonSchema: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    };
  }
  return {};
}

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
const DEFAULT_OPENAI_MODEL = "gpt-5.1-mini";

export function getDefaultModelConfigFromEnv(): ResolvedModelConfig {
  const provider = (process.env.AI_PROVIDER ?? "google") as AIProvider;

  if (provider === "google") {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.GEMINI_API_KEY ??
      "";
    if (!apiKey) {
      throw new Error(
        "AI provider is set to 'google' but no API key was found. " +
          "Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY.",
      );
    }
    return {
      provider: "google",
      apiKey,
      modelId: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    };
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "AI provider is set to 'openai' but OPENAI_API_KEY is not set.",
      );
    }
    return {
      provider: "openai",
      apiKey,
      modelId: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    };
  }

  throw new Error(
    `Unknown AI_PROVIDER value "${provider}". Supported values: "google", "openai".`,
  );
}
