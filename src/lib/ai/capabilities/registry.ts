/**
 * AI capability registry — one text config for all LLM text features.
 * Phase 2 routes resolve capability `text` (chat, evaluate, rubrics, etc.).
 */

export const AI_PROVIDERS = [
  { value: "google", label: "Google (Gemini)" },
  { value: "openai", label: "OpenAI" },
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number]["value"];

export const TEXT_CAPABILITY_KEY = "text" as const;

export type AiCapabilityKey = typeof TEXT_CAPABILITY_KEY;

export interface AiCapabilityDefinition {
  key: AiCapabilityKey;
  label: string;
  description: string;
  modelPlaceholders: Record<AiProvider, string>;
}

export const AI_CAPABILITY_REGISTRY: Record<
  AiCapabilityKey,
  AiCapabilityDefinition
> = {
  text: {
    key: "text",
    label: "Text-based functionalities",
    description:
      "Chat, evaluation, rubrics, and dynamic questions — one provider, model, and API key.",
    modelPlaceholders: {
      google: "gemini-3-flash-preview",
      openai: "gpt-5.1-mini",
    },
  },
};

export function listAiCapabilities(): AiCapabilityDefinition[] {
  return Object.values(AI_CAPABILITY_REGISTRY);
}

export function isAiCapabilityKey(key: string): key is AiCapabilityKey {
  return key === TEXT_CAPABILITY_KEY;
}

export function getAiCapabilityDefinition(
  key: AiCapabilityKey = TEXT_CAPABILITY_KEY,
): AiCapabilityDefinition {
  return AI_CAPABILITY_REGISTRY[key];
}

export function asAiCapabilityKey(raw: string): AiCapabilityKey {
  if (!isAiCapabilityKey(raw)) {
    throw new Error(`Unknown AI capability key: ${raw}`);
  }
  return raw;
}
