import "server-only";

import { getProviderLanguageCodeForKonvo } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import type { SynthesizeInput, TtsProvider } from "../../types";
import { CARTESIA_API_BASE, cartesiaHeaders } from "./client";

export const CARTESIA_TTS_SAMPLE_RATE = 24000;
export const CARTESIA_TTS_MIME = "audio/L16;rate=24000";

async function requestTtsBytes(input: SynthesizeInput): Promise<Buffer> {
  const voiceId = input.voice;
  if (!voiceId) {
    throw new Error("Cartesia TTS requires a voice id.");
  }

  const model = input.apiModelId ?? "sonic-3.5";
  const language = input.language
    ? getProviderLanguageCodeForKonvo(input.language)
    : "en";
  console.log(
    `[konvo-voice/tts] provider=cartesia model=${model} locale=${input.language ?? ""} language=${language} voiceId=${voiceId} textLen=${input.text.length}`,
  );

  const response = await fetch(`${CARTESIA_API_BASE}/tts/bytes`, {
    method: "POST",
    headers: {
      ...cartesiaHeaders(input.providerApiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: model,
      transcript: input.text,
      voice: { mode: "id", id: voiceId },
      language,
      ...(input.contextId ? { context_id: input.contextId } : {}),
      ...(typeof input.continueGeneration === "boolean"
        ? { continue: input.continueGeneration }
        : {}),
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: CARTESIA_TTS_SAMPLE_RATE,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[konvo-voice/tts] provider=cartesia status=${response.status} detail=${detail}`,
    );
    throw new Error(
      `Cartesia TTS failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  console.log(
    `[konvo-voice/tts] provider=cartesia status=${response.status} audioBytes=${audio.length}`,
  );
  return audio;
}

export const cartesiaTtsProvider: TtsProvider = {
  id: "cartesia",
  supportsStream: true,
  streamFormat: {
    mimeType: CARTESIA_TTS_MIME,
    sampleRate: CARTESIA_TTS_SAMPLE_RATE,
  },

  async synthesize(input) {
    const audio = await requestTtsBytes(input);
    return { audio, mimeType: CARTESIA_TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    const audio = await requestTtsBytes(input);
    if (audio.length > 0) {
      yield new Uint8Array(audio);
    }
  },
};
