/**
 * AI capability registry — one text config for all LLM text features.
 * Phase 2 routes resolve capability `text` (chat, evaluate, rubrics, etc.).
 */

export const DEFAULT_GOOGLE_MODEL = "gemini-3-flash-preview";

/** Curated Gemini models for settings UI and save validation. value === label. */
export const GOOGLE_MODELS = [
  {
    value: "gemini-3-flash-preview",
    label: "gemini-3-flash-preview",
  },
] as const;

export type GoogleModelId = (typeof GOOGLE_MODELS)[number]["value"];

export const AI_PROVIDERS = [
  { value: "google", label: "Google (Gemini)" },
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number]["value"];

export const TEXT_CAPABILITY_KEY = "text" as const;

export type AiCapabilityKey = typeof TEXT_CAPABILITY_KEY;

export interface AiCapabilityDefinition {
  key: AiCapabilityKey;
  label: string;
  description: string;
  defaultModelId: GoogleModelId;
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
    defaultModelId: DEFAULT_GOOGLE_MODEL,
  },
};

const GOOGLE_MODEL_IDS = new Set<string>(GOOGLE_MODELS.map((m) => m.value));

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

export function isValidGoogleModelId(modelId: string): modelId is GoogleModelId {
  return GOOGLE_MODEL_IDS.has(modelId);
}

export function resolveGoogleModelId(
  raw: string | null | undefined,
  fallback: GoogleModelId = DEFAULT_GOOGLE_MODEL,
): GoogleModelId {
  const trimmed = raw?.trim();
  if (trimmed && isValidGoogleModelId(trimmed)) {
    return trimmed;
  }
  return fallback;
}

/** Normalize stored provider to a supported BYOK provider (google only for now). */
export function resolveAiProvider(
  raw: string | null | undefined,
): AiProvider {
  const trimmed = raw?.trim();
  if (trimmed && AI_PROVIDERS.some((p) => p.value === trimmed)) {
    return trimmed as AiProvider;
  }
  return "google";
}

/** Model options for the selected provider in settings UI. */
export function modelsForProvider(provider: AiProvider) {
  if (provider === "google") {
    return GOOGLE_MODELS;
  }
  return GOOGLE_MODELS;
}

export function defaultModelIdForProvider(
  provider: AiProvider,
  definition: AiCapabilityDefinition,
): GoogleModelId {
  if (provider === "google") {
    return definition.defaultModelId;
  }
  return definition.defaultModelId;
}
