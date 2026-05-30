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
    // Auto-detect: omit `language` so Whisper detects the spoken language.
    const language =
      input.autoDetect || !input.language
        ? undefined
        : getProviderLanguageCodeForKonvo(input.language);
    console.log(
      `[konvo-voice/stt] provider=openai model=${model} locale=${input.language ?? ""} language=${language ?? "(auto)"} autoDetect=${Boolean(input.autoDetect)} audioBytes=${input.audio.length}`,
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
