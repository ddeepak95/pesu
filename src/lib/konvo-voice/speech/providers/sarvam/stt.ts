import "server-only";

import { toFile } from "openai";
import type { SttProvider } from "../../types";
import { SARVAM_API_BASE, sarvamHeaders } from "./client";
import { toSarvamLanguageCode } from "./language";
import { normalizeSarvamRestUpload } from "./mime";

export const sarvamSttProvider: SttProvider = {
  id: "sarvam",
  supportsStream: false,

  async transcribe(input) {
    const model = input.apiModelId ?? "saaras:v3";
    const languageCode = input.language
      ? toSarvamLanguageCode(input.language)
      : "en-IN";
    console.log(
      `[konvo-voice/stt] provider=sarvam model=${model} locale=${input.language ?? ""} language_code=${languageCode} audioBytes=${input.audio.length}`,
    );

    const { mimeType, filename } = normalizeSarvamRestUpload(
      input.mimeType,
      input.filename,
    );
    const file = await toFile(input.audio, filename, {
      type: mimeType,
    });

    const form = new FormData();
    form.append("file", file);
    form.append("model", model);
    form.append("mode", "transcribe");
    form.append("language_code", languageCode);
    // Sarvam reports no duration/usage by default (§5.1) — request word-level
    // timestamps so audio duration can be self-measured from the last word's
    // end time, instead of relying entirely on the (currently unsent) client
    // fallback.
    form.append("with_timestamps", "true");

    const response = await fetch(`${SARVAM_API_BASE}/speech-to-text`, {
      method: "POST",
      headers: sarvamHeaders(undefined, input.providerApiKey),
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[konvo-voice/stt] provider=sarvam status=${response.status} detail=${detail}`,
      );
      throw Object.assign(
        new Error(
          `Sarvam transcription failed (${response.status})${detail ? `: ${detail}` : ""}`,
        ),
        { statusCode: response.status },
      );
    }

    const body = (await response.json()) as {
      transcript?: string;
      timestamps?: { words?: string[]; end_time_seconds?: number[] } | null;
    };
    const text = body.transcript ?? "";
    console.log(
      `[konvo-voice/stt] provider=sarvam response.textLen=${text.length} text=${JSON.stringify(text.slice(0, 200))}`,
    );

    const endTimes = body.timestamps?.end_time_seconds;
    const audioMs =
      Array.isArray(endTimes) && endTimes.length > 0
        ? Math.round(Math.max(...endTimes) * 1000)
        : null;

    return {
      text,
      usage: audioMs != null ? { audioMs, source: "measured", raw: body.timestamps } : undefined,
    };
  },
};
