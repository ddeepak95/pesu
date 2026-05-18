import "server-only";

import type { SynthesizeInput, TtsProvider } from "../../types";
import {
  OPENAI_TTS_MODEL,
  OPENAI_TTS_VOICE,
} from "../../config";
import { getOpenAIClient } from "./client";

const TTS_MIME = "audio/mpeg";

async function synthesizeBuffer(input: SynthesizeInput): Promise<Buffer> {
  const openai = getOpenAIClient();
  const response = await openai.audio.speech.create({
    model: OPENAI_TTS_MODEL,
    voice: input.voice ?? OPENAI_TTS_VOICE,
    input: input.text,
  });
  return Buffer.from(await response.arrayBuffer());
}

export const openaiTtsProvider: TtsProvider = {
  id: "openai",
  supportsStream: true,

  async synthesize(input) {
    const audio = await synthesizeBuffer(input);
    return { audio, mimeType: TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    const audio = await synthesizeBuffer(input);
    const chunkSize = 4096;
    for (let i = 0; i < audio.length; i += chunkSize) {
      yield new Uint8Array(audio.subarray(i, i + chunkSize));
    }
  },
};
