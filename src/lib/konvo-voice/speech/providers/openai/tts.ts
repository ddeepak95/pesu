import "server-only";

import type { SynthesizeInput, TtsProvider } from "../../types";
import {
  OPENAI_TTS_MODEL,
  OPENAI_TTS_MIME,
  OPENAI_TTS_RESPONSE_FORMAT,
  OPENAI_TTS_SAMPLE_RATE,
  OPENAI_TTS_VOICE,
} from "../../config";
import { getOpenAIClient } from "./client";

async function synthesizeBuffer(input: SynthesizeInput): Promise<Buffer> {
  const openai = getOpenAIClient(input.providerApiKey);
  const model = input.apiModelId ?? OPENAI_TTS_MODEL;
  const voice = input.voice ?? OPENAI_TTS_VOICE;
  console.log(
    `[konvo-voice/tts] provider=openai model=${model} locale=${input.language ?? ""} voice=${voice} textLen=${input.text.length}`,
  );
  const response = await openai.audio.speech.create({
    model,
    voice: voice as
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "fable"
      | "nova"
      | "onyx"
      | "sage"
      | "shimmer"
      | "verse"
      | "marin"
      | "cedar",
    input: input.text,
    response_format: OPENAI_TTS_RESPONSE_FORMAT,
  });
  const audio = Buffer.from(await response.arrayBuffer());
  console.log(
    `[konvo-voice/tts] provider=openai audioBytes=${audio.length}`,
  );
  return audio;
}

async function* readResponseBody(
  response: Response,
): AsyncGenerator<Uint8Array> {
  if (!response.body) {
    const all = Buffer.from(await response.arrayBuffer());
    if (all.length > 0) yield new Uint8Array(all);
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export const openaiTtsProvider: TtsProvider = {
  id: "openai",
  supportsStream: true,
  streamFormat: {
    mimeType: OPENAI_TTS_MIME,
    sampleRate: OPENAI_TTS_SAMPLE_RATE,
  },

  async synthesize(input) {
    const audio = await synthesizeBuffer(input);
    return { audio, mimeType: OPENAI_TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    const openai = getOpenAIClient(input.providerApiKey);
    const model = input.apiModelId ?? OPENAI_TTS_MODEL;
    const voice = input.voice ?? OPENAI_TTS_VOICE;
    console.log(
      `[konvo-voice/tts] provider=openai stream=true model=${model} locale=${input.language ?? ""} voice=${voice} textLen=${input.text.length}`,
    );
    const response = await openai.audio.speech.create({
      model,
      voice: voice as
        | "alloy"
        | "ash"
        | "ballad"
        | "coral"
        | "echo"
        | "fable"
        | "nova"
        | "onyx"
        | "sage"
        | "shimmer"
        | "verse"
        | "marin"
        | "cedar",
      input: input.text,
      response_format: OPENAI_TTS_RESPONSE_FORMAT,
    });

    let totalBytes = 0;
    for await (const chunk of readResponseBody(response)) {
      totalBytes += chunk.length;
      yield chunk;
    }
    console.log(
      `[konvo-voice/tts] provider=openai stream=true audioBytes=${totalBytes}`,
    );
  },
};
