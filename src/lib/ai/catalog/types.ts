export type ProviderId = "google" | "openai" | "cartesia" | "sarvam";

export type ModelClass = "foundation" | "speech" | "realtime";

export type ModelTask =
  | "text_generation"
  | "speech_to_text"
  | "text_to_speech"
  | "realtime_dialogue";

export type Modality = "text" | "image" | "video" | "audio";

export type CatalogModelStatus =
  | "available"
  | "coming_soon"
  | "provider_inactive";

export type CatalogBrowseMode = "provider" | "category" | "modality";

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  description: string;
  activationLabel: string;
  /** Provider cannot be activated in the UI yet. */
  comingSoon?: boolean;
}

/** Gemini 3 thinking levels (see getDefaultProviderOptions in lib/ai/config.ts). */
export type GoogleThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * OpenAI `reasoning.effort` for Responses API reasoning models.
 * @see https://developers.openai.com/api/docs/models/gpt-5.4
 * @see https://developers.openai.com/docs/guides/reasoning
 */
export type OpenAiReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** Reasoning options a catalog model supports (subset of provider-wide options). */
export type ModelReasoningCapabilities =
  | { kind: "google"; levels: GoogleThinkingLevel[] }
  | { kind: "openai"; efforts: OpenAiReasoningEffort[] };

export interface ModelCatalogEntry {
  id: string;
  providerId: ProviderId;
  label: string;
  modelClass: ModelClass;
  tasks: ModelTask[];
  io: { inputs: Modality[]; outputs: Modality[] };
  status: "available" | "coming_soon";
  apiSurface?: "chat_completions" | "live" | "transcribe" | "synthesize";
  /** Konvo prototype: batch REST vs WebSocket streaming STT. */
  sttDelivery?: "batch" | "stream";
  /** ISO-style codes from supportedLanguages.ts (prototype / speech models). */
  supportedLanguageCodes?: string[];
  /** Provider API model id (speech models; foundation models use `id`). */
  apiModelId?: string;
  /** When set, this model supports configurable reasoning at the listed levels/efforts. */
  reasoningCapabilities?: ModelReasoningCapabilities;
}

export interface AppSubFunctionCatalogEntry {
  key: string;
  label: string;
  description: string;
  consumers?: string[];
  /**
   * Tasks a model must support to be eligible for this sub-function. When
   * omitted, the parent function's `requiredTasks` apply (e.g. MCQ generation
   * inherits `text_generation`). Set this for sub-functions that need a
   * different capability than their parent (e.g. a future image action that
   * requires `image_generation`).
   */
  requiredTasks?: ModelTask[];
}

export interface AppFunctionCatalogEntry {
  key: string;
  label: string;
  description: string;
  requiredTasks: ModelTask[];
  consumers?: string[];
  subFunctions?: AppSubFunctionCatalogEntry[];
  status: "available" | "coming_soon";
}

export interface ProviderActivationState {
  isActive: boolean;
  apiKey: string;
  keyHint: string | null;
  usePlatformDefault: boolean;
}

/** Reasoning selection saved with a function binding (includes available snapshot). */
export type SavedModelReasoningConfig =
  | {
      kind: "google";
      availableLevels: GoogleThinkingLevel[];
      thinkingLevel: GoogleThinkingLevel;
    }
  | {
      kind: "openai";
      availableEfforts: OpenAiReasoningEffort[];
      reasoningEffort: OpenAiReasoningEffort;
    };

export interface FunctionBindingState {
  providerId: ProviderId;
  modelId: string;
  reasoning?: SavedModelReasoningConfig;
}

export type AiSettingsScope = "platform" | "institution" | "class";

export interface LocalAiSettingsState {
  providers: Record<ProviderId, ProviderActivationState>;
  functions: Record<string, FunctionBindingState>;
}
