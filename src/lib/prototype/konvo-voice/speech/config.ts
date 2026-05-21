import type { SpeechProviderId } from "./types";

export const STT_PROVIDER_ID: SpeechProviderId = "openai";
export const TTS_PROVIDER_ID: SpeechProviderId = "openai";

export const OPENAI_STT_MODEL = "gpt-4o-mini-transcribe";
export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICE = "alloy";
/** OpenAI PCM: 24 kHz, 16-bit signed LE mono (no header). */
export const OPENAI_TTS_RESPONSE_FORMAT = "pcm" as const;
export const OPENAI_TTS_SAMPLE_RATE = 24000;
export const OPENAI_TTS_MIME = "audio/L16;rate=24000";
