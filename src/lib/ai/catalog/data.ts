import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";

import type {
  AppFunctionCatalogEntry,
  GoogleThinkingLevel,
  ModelCatalogEntry,
  ModelClass,
  OpenAiReasoningEffort,
  ProviderCatalogEntry,
} from "./types";

export const GOOGLE_THINKING_LEVEL_OPTIONS: {
  value: GoogleThinkingLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "minimal",
    label: "Minimal",
    description: "Fastest responses; light internal reasoning.",
  },
  {
    value: "low",
    label: "Low",
    description: "Balanced speed with modest reasoning depth.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "More deliberate reasoning for harder tasks.",
  },
  {
    value: "high",
    label: "High",
    description: "Deepest reasoning; slower and higher latency.",
  },
];

/** Labels aligned with OpenAI reasoning effort guidance (GPT-5.4 supports all five). */
export const OPENAI_REASONING_EFFORT_OPTIONS: {
  value: OpenAiReasoningEffort;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "None",
    description:
      "Latency-critical tasks with no reasoning or multi-chained tool calls (GPT-5.4 default).",
  },
  {
    value: "low",
    label: "Low",
    description:
      "Efficient reasoning with modest latency; tool use, planning, search, multi-step decisions.",
  },
  {
    value: "medium",
    label: "Medium",
    description:
      "Balanced quality for planning, complex reasoning, and judgment-heavy work.",
  },
  {
    value: "high",
    label: "High",
    description:
      "Hard reasoning, complex debugging, deep planning; quality over latency.",
  },
  {
    value: "xhigh",
    label: "Extra high",
    description:
      "Deep research and long agentic rollouts when evals justify extra latency and cost.",
  },
];

export const MODEL_CLASS_LABEL: Record<ModelClass, string> = {
  foundation: "Foundation (generative / multimodal)",
  speech: "Speech",
  realtime: "Realtime",
};

export const MODEL_CLASS_ORDER: ModelClass[] = [
  "foundation",
  "speech",
  "realtime",
];

export const CATALOG_PROVIDER_IDS = ["google", "openai"] as const;

export const CATALOG_PROVIDERS: ProviderCatalogEntry[] = [
  {
    id: "google",
    label: "Google (Gemini)",
    description: "Gemini foundation, speech, and live APIs.",
    activationLabel: "API key",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT foundation models, Whisper, and TTS APIs.",
    activationLabel: "API key",
  },
];

export const CATALOG_MODELS: ModelCatalogEntry[] = [
  {
    id: "gemini-3-flash-preview",
    providerId: "google",
    label: "Gemini 3 Flash Preview",
    modelClass: "foundation",
    tasks: ["text_generation"],
    io: { inputs: ["text"], outputs: ["text"] },
    status: "available",
    apiSurface: "chat_completions",
    reasoningCapabilities: {
      kind: "google",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
  {
    id: "gemini-2.5-pro-preview",
    providerId: "google",
    label: "Gemini 2.5 Pro Preview",
    modelClass: "foundation",
    tasks: ["text_generation"],
    io: { inputs: ["text", "image"], outputs: ["text"] },
    status: "coming_soon",
    apiSurface: "chat_completions",
    reasoningCapabilities: {
      kind: "google",
      levels: ["low", "medium", "high"],
    },
  },
  {
    id: "gemini-live-preview",
    providerId: "google",
    label: "Gemini Live",
    modelClass: "realtime",
    tasks: ["realtime_dialogue"],
    io: { inputs: ["text", "audio"], outputs: ["text", "audio"] },
    status: "coming_soon",
    apiSurface: "live",
  },
  {
    id: "google-stt-standard",
    providerId: "google",
    label: "Google Speech-to-Text",
    modelClass: "speech",
    tasks: ["speech_to_text"],
    io: { inputs: ["audio"], outputs: ["text"] },
    status: "coming_soon",
    apiSurface: "transcribe",
  },
  {
    id: "google-tts-standard",
    providerId: "google",
    label: "Google Text-to-Speech",
    modelClass: "speech",
    tasks: ["text_to_speech"],
    io: { inputs: ["text"], outputs: ["audio"] },
    status: "coming_soon",
    apiSurface: "synthesize",
  },
  {
    id: "gpt-5.4",
    providerId: "openai",
    label: "GPT-5.4",
    modelClass: "foundation",
    tasks: ["text_generation"],
    io: { inputs: ["text", "image"], outputs: ["text"] },
    status: "available",
    apiSurface: "chat_completions",
    reasoningCapabilities: {
      kind: "openai",
      efforts: ["none", "low", "medium", "high", "xhigh"],
    },
  },
  {
    id: "gpt-4o",
    providerId: "openai",
    label: "GPT-4o",
    modelClass: "foundation",
    tasks: ["text_generation"],
    io: { inputs: ["text", "image"], outputs: ["text"] },
    status: "available",
    apiSurface: "chat_completions",
    reasoningCapabilities: {
      kind: "openai",
      efforts: ["low", "medium", "high"],
    },
  },
  {
    id: "whisper-1",
    providerId: "openai",
    label: "Whisper",
    modelClass: "speech",
    tasks: ["speech_to_text"],
    io: { inputs: ["audio"], outputs: ["text"] },
    status: "coming_soon",
    apiSurface: "transcribe",
  },
];

export const CATALOG_FUNCTIONS: AppFunctionCatalogEntry[] = [
  {
    key: TEXT_CAPABILITY_KEY,
    label: "Text-based features",
    description:
      "Default provider and model for all text-powered product features.",
    requiredTasks: ["text_generation"],
    status: "available",
    subFunctions: [
      {
        key: "chat_tutoring",
        label: "Chat Tutoring",
        description: "Interactive tutoring conversations with students.",
        consumers: ["Assignment chat", "Tutor mode"],
      },
      {
        key: "evaluation",
        label: "Evaluation",
        description: "Score and feedback on student responses against rubrics.",
        consumers: ["Response evaluation", "Rubric scoring"],
      },
      {
        key: "dynamic_questions",
        label: "Dynamic Questions Generation",
        description: "Generate follow-up or adaptive questions from context.",
        consumers: ["Dynamic question flows"],
      },
    ],
  },
  {
    key: "speech_to_text",
    label: "Speech-to-text",
    description: "Transcribe student audio responses.",
    requiredTasks: ["speech_to_text"],
    consumers: ["Voice input (planned)"],
    status: "coming_soon",
  },
  {
    key: "text_to_speech",
    label: "Text-to-speech",
    description: "Read questions and feedback aloud.",
    requiredTasks: ["text_to_speech"],
    consumers: ["Voice output (planned)"],
    status: "coming_soon",
  },
  {
    key: "realtime_dialogue",
    label: "Realtime dialogue",
    description: "Low-latency voice conversations with the tutor.",
    requiredTasks: ["realtime_dialogue"],
    consumers: ["Live tutor (planned)"],
    status: "coming_soon",
  },
];
