import "server-only";

import { STT_PROVIDER_ID, TTS_PROVIDER_ID } from "./config";
import { openaiSttProvider } from "./providers/openai/stt";
import { openaiTtsProvider } from "./providers/openai/tts";
import type { SpeechProviderId, SttProvider, TtsProvider } from "./types";

const STT_PROVIDERS: Record<SpeechProviderId, SttProvider> = {
  openai: openaiSttProvider,
};

const TTS_PROVIDERS: Record<SpeechProviderId, TtsProvider> = {
  openai: openaiTtsProvider,
};

export function getSttProvider(): SttProvider {
  const provider = STT_PROVIDERS[STT_PROVIDER_ID];
  if (!provider) {
    throw new Error(`Unknown STT provider: ${STT_PROVIDER_ID}`);
  }
  return provider;
}

export function getTtsProvider(): TtsProvider {
  const provider = TTS_PROVIDERS[TTS_PROVIDER_ID];
  if (!provider) {
    throw new Error(`Unknown TTS provider: ${TTS_PROVIDER_ID}`);
  }
  return provider;
}
