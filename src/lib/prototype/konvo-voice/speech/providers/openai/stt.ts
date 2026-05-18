import "server-only";

import { toFile } from "openai";
import type { SttProvider, TranscribeInput } from "../../types";
import { OPENAI_STT_MODEL } from "../../config";
import { getOpenAIClient } from "./client";

export const openaiSttProvider: SttProvider = {
  id: "openai",
  supportsStream: false,

  async transcribe(input) {
    const openai = getOpenAIClient();
    const file = await toFile(input.audio, input.filename, {
      type: input.mimeType ?? "audio/webm",
    });

    const result = await openai.audio.transcriptions.create({
      file,
      model: OPENAI_STT_MODEL,
    });

    return { text: result.text ?? "" };
  },
};
