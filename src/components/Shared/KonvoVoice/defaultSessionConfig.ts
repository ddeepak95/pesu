import type { KonvoSessionConfig } from "@/lib/konvo-voice/sessionConfig";

export const DEFAULT_KONVO_SESSION_CONFIG: KonvoSessionConfig = {
  language: "en",
  activityType: "learning",
  sttModelId: "openai-gpt-4o-mini-transcribe",
  ttsModelId: "openai-gpt-4o-mini-tts",
  llmModelId: "gemini-3-flash-preview",
};
