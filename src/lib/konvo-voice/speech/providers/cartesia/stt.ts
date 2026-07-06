import "server-only";

import { getProviderLanguageCodeForKonvo } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { toFile } from "openai";
import type { SttProvider } from "../../types";
import {
  CARTESIA_API_BASE,
  CARTESIA_API_VERSION,
  getCartesiaApiKey,
} from "./client";

export const cartesiaSttProvider: SttProvider = {
  id: "cartesia",
  supportsStream: false,

  async transcribe(input) {
    const apiKey = getCartesiaApiKey(input.providerApiKey);
    const file = await toFile(input.audio, input.filename, {
      type: input.mimeType ?? "audio/webm",
    });

    const model = input.apiModelId ?? "ink-whisper";
    const language = input.language
      ? getProviderLanguageCodeForKonvo(input.language)
      : "en";
    console.log(
      `[konvo-voice/stt] provider=cartesia model=${model} locale=${input.language ?? ""} language=${language} audioBytes=${input.audio.length}`,
    );

    const form = new FormData();
    form.append("file", file);
    form.append("model", model);
    form.append("language", language);

    const response = await fetch(`${CARTESIA_API_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": CARTESIA_API_VERSION,
      },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[konvo-voice/stt] provider=cartesia status=${response.status} detail=${detail}`,
      );
      throw Object.assign(
        new Error(
          `Cartesia transcription failed (${response.status})${detail ? `: ${detail}` : ""}`,
        ),
        { statusCode: response.status },
      );
    }

    const body = (await response.json()) as { text?: string };
    const text = body.text ?? "";
    console.log(
      `[konvo-voice/stt] provider=cartesia response.textLen=${text.length} text=${JSON.stringify(text.slice(0, 200))}`,
    );
    return { text };
  },
};
