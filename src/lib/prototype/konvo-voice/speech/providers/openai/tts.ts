import "server-only";

import type { SynthesizeInput, TtsProvider } from "../../types";
import {
  OPENAI_TTS_MODEL,
  OPENAI_TTS_MIME,
  OPENAI_TTS_RESPONSE_FORMAT,
  OPENAI_TTS_VOICE,
} from "../../config";
import { getOpenAIClient } from "./client";

async function synthesizeBuffer(input: SynthesizeInput): Promise<Buffer> {
  const openai = getOpenAIClient();
  const response = await openai.audio.speech.create({
    model: OPENAI_TTS_MODEL,
    voice: input.voice ?? OPENAI_TTS_VOICE,
    input: input.text,
    response_format: OPENAI_TTS_RESPONSE_FORMAT,
  });
  return Buffer.from(await response.arrayBuffer());
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

  async synthesize(input) {
    const audio = await synthesizeBuffer(input);
    return { audio, mimeType: OPENAI_TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    const openai = getOpenAIClient();
    const response = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: input.voice ?? OPENAI_TTS_VOICE,
      input: input.text,
      response_format: OPENAI_TTS_RESPONSE_FORMAT,
    });

    yield* readResponseBody(response);
  },
};
