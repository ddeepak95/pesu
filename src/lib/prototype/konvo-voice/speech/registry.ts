import "server-only";

import { getCatalogEntry } from "@/lib/prototype/konvo-voice/sessionCatalog";
import type { ProviderId } from "@/lib/ai/catalog/types";
import { cartesiaSttProvider } from "./providers/cartesia/stt";
import { cartesiaTtsProvider } from "./providers/cartesia/tts";
import { openaiSttProvider } from "./providers/openai/stt";
import { openaiTtsProvider } from "./providers/openai/tts";
import { sarvamSttProvider } from "./providers/sarvam/stt";
import { sarvamTtsProvider } from "./providers/sarvam/tts";
import type { SpeechProviderId, SttProvider, TtsProvider } from "./types";

const STT_PROVIDERS: Record<SpeechProviderId, SttProvider> = {
  openai: openaiSttProvider,
  cartesia: cartesiaSttProvider,
  sarvam: sarvamSttProvider,
};

const TTS_PROVIDERS: Record<SpeechProviderId, TtsProvider> = {
  openai: openaiTtsProvider,
  cartesia: cartesiaTtsProvider,
  sarvam: sarvamTtsProvider,
};

function speechProviderId(providerId: ProviderId): SpeechProviderId {
  if (providerId === "openai" || providerId === "cartesia" || providerId === "sarvam") {
    return providerId;
  }
  throw new Error(`Provider "${providerId}" does not support speech APIs.`);
}

export function getSttProvider(catalogModelId: string): SttProvider {
  const entry = getCatalogEntry(catalogModelId);
  if (!entry || !entry.tasks.includes("speech_to_text")) {
    throw new Error(`Unknown STT catalog model: ${catalogModelId}`);
  }
  const providerId = speechProviderId(entry.providerId);
  const provider = STT_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`No STT provider registered for: ${providerId}`);
  }
  return provider;
}

export function getTtsProvider(catalogModelId: string): TtsProvider {
  const entry = getCatalogEntry(catalogModelId);
  if (!entry || !entry.tasks.includes("text_to_speech")) {
    throw new Error(`Unknown TTS catalog model: ${catalogModelId}`);
  }
  const providerId = speechProviderId(entry.providerId);
  const provider = TTS_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`No TTS provider registered for: ${providerId}`);
  }
  return provider;
}

export function getSpeechApiModelId(catalogModelId: string): string | undefined {
  return getCatalogEntry(catalogModelId)?.apiModelId;
}
