/**
 * AI provider configuration.
 *
 * Reading env is centralised here so that getLanguageModel() stays pure
 * (no process.env reads inside the factory). Future BYOK flows resolve a
 * ResolvedModelConfig from DB/session and pass it directly to getLanguageModel().
 *
 * Environment variables:
 *   AI_PROVIDER          - "google" (default) | "openai"
 *   GEMINI_MODEL         - optional model override (default: gemini-2.0-flash)
 *   OPENAI_MODEL         - optional model override (default: gpt-4o)
 *   GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY  - Google provider key
 *   OPENAI_API_KEY       - OpenAI provider key (when AI_PROVIDER=openai)
 */

export type AIProvider = "google" | "openai";

export interface ResolvedModelConfig {
  provider: AIProvider;
  apiKey: string;
  modelId: string;
}

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o";

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
