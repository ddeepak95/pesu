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

    const result = await openai.audio.transcriptions.create(
      {
        file,
        model,
        ...(language ? { language } : {}),
      },
      { timeout: 20_000, maxRetries: 0 },
    );

    const text = result.text ?? "";
    console.log(
      `[konvo-voice/stt] provider=openai response.textLen=${text.length} text=${JSON.stringify(text.slice(0, 200))}`,
    );

    // gpt-4o-mini-transcribe returns token usage (no direct duration); the
    // coming_soon whisper-1 instead returns a duration usage object. Capture
    // whichever shape is present; audioMs stays unset for the token variant
    // (§5.1) — the route falls back to a measured/estimated duration.
    const usage = result.usage;
    return {
      text,
      usage: usage
        ? {
            audioMs: usage.type === "duration" ? usage.seconds * 1000 : null,
            providerTokens:
              usage.type === "tokens"
                ? {
                    input: usage.input_tokens,
                    output: usage.output_tokens,
                    audio: usage.input_token_details?.audio_tokens,
                  }
                : null,
            source: "provider",
            raw: usage,
          }
        : undefined,
    };
  },
};
