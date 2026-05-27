import "server-only";

import { getProviderLanguageCodeForKonvo } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { toFile } from "openai";
import type { SttProvider } from "../../types";
import { OPENAI_STT_MODEL } from "../../config";
import { getOpenAIClient } from "./client";

export const openaiSttProvider: SttProvider = {
  id: "openai",
  supportsStream: false,

  async transcribe(input) {
    const openai = getOpenAIClient(input.providerApiKey);
    const file = await toFile(input.audio, input.filename, {
      type: input.mimeType ?? "audio/webm",
    });

    const model = input.apiModelId ?? OPENAI_STT_MODEL;
    const language = input.language
      ? getProviderLanguageCodeForKonvo(input.language)
      : undefined;
    console.log(
      `[konvo-voice/stt] provider=openai model=${model} locale=${input.language ?? ""} language=${language ?? ""} audioBytes=${input.audio.length}`,
    );

    const result = await openai.audio.transcriptions.create({
      file,
      model,
      ...(language ? { language } : {}),
    });

    const text = result.text ?? "";
    console.log(
      `[konvo-voice/stt] provider=openai response.textLen=${text.length} text=${JSON.stringify(text.slice(0, 200))}`,
    );
    return { text };
  },
};
