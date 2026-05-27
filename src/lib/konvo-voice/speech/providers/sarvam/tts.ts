import "server-only";

import type { SynthesizeInput, TtsProvider } from "../../types";
import { SARVAM_API_BASE, sarvamHeaders } from "./client";
import { toSarvamLanguageCode } from "./language";

export const SARVAM_TTS_SAMPLE_RATE = 24000;
export const SARVAM_TTS_MIME = "audio/wav";

async function requestTtsBytes(input: SynthesizeInput): Promise<Buffer> {
  const speaker = input.voice;
  if (!speaker) {
    throw new Error("Sarvam TTS requires a speaker name.");
  }

  const model = input.apiModelId ?? "bulbul:v3";
  const targetLanguageCode = input.language
    ? toSarvamLanguageCode(input.language)
    : "en-IN";
  console.log(
    `[konvo-voice/tts] provider=sarvam model=${model} locale=${input.language ?? ""} target_language_code=${targetLanguageCode} speaker=${speaker} textLen=${input.text.length}`,
  );

  const response = await fetch(`${SARVAM_API_BASE}/text-to-speech`, {
    method: "POST",
    headers: sarvamHeaders("application/json", input.providerApiKey),
    body: JSON.stringify({
      model,
      text: input.text,
      target_language_code: targetLanguageCode,
      speaker,
      speech_sample_rate: SARVAM_TTS_SAMPLE_RATE,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[konvo-voice/tts] provider=sarvam status=${response.status} detail=${detail}`,
    );
    throw new Error(
      `Sarvam TTS failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const body = (await response.json()) as { audios?: string[] };
  const b64 = body.audios?.[0];
  if (!b64) {
    throw new Error("Sarvam TTS returned no audio.");
  }

  const audio = Buffer.from(b64, "base64");
  console.log(
    `[konvo-voice/tts] provider=sarvam status=${response.status} audioBytes=${audio.length}`,
  );
  return audio;
}

export const sarvamTtsProvider: TtsProvider = {
  id: "sarvam",
  supportsStream: true,
  streamFormat: {
    mimeType: SARVAM_TTS_MIME,
    sampleRate: SARVAM_TTS_SAMPLE_RATE,
  },

  async synthesize(input) {
    const audio = await requestTtsBytes(input);
    return { audio, mimeType: SARVAM_TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    const audio = await requestTtsBytes(input);
    if (audio.length > 0) {
      yield new Uint8Array(audio);
    }
  },
};
