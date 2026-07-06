import { NextRequest, NextResponse } from "next/server";
import {
  getSpeechApiModelId,
  getSttProvider,
} from "@/lib/konvo-voice/speech/registry";
import type { KonvoSessionConfig } from "@/lib/konvo-voice/sessionConfig";
import { isProviderConfigured } from "@/lib/konvo-voice/sessionCatalog";
import { getCatalogEntry } from "@/lib/konvo-voice/sessionCatalog";
import {
  SARVAM_STT_CATALOG_MODEL_ID,
  SARVAM_STT_MAX_DURATION_MS,
} from "@/lib/konvo-voice/speech/constants";
import { resolveProviderApiKeyForAssignment } from "@/lib/konvo-voice/speech/resolveProviderKey";
import { withRetry } from "@/lib/ai/retry";

function parseSessionConfig(raw: string | null): KonvoSessionConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KonvoSessionConfig;
  } catch {
    return null;
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function collectAudioSegments(formData: FormData): Blob[] {
  const segmentCountRaw = formData.get("segmentCount");
  const segmentCount =
    typeof segmentCountRaw === "string"
      ? Number.parseInt(segmentCountRaw, 10)
      : 0;

  // Sarvam client always sends segmentCount + audio_0…n (including n=1).
  if (Number.isFinite(segmentCount) && segmentCount >= 1) {
    const segments: Blob[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const item = formData.get(`audio_${i}`);
      if (isUploadFile(item)) {
        segments.push(item);
      }
    }
    if (segments.length > 0) {
      return segments;
    }
  }

  const audio = formData.get("audio");
  if (isUploadFile(audio)) {
    return [audio];
  }

  return [];
}

export interface TranscribeCandidate {
  language: string;
  text: string;
}

export interface TranscribeResponse {
  text: string;
  /** Present only when dual transcription was performed (two non-empty candidates). */
  candidates?: TranscribeCandidate[];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionRaw = formData.get("sessionConfig");
    const sessionConfig = parseSessionConfig(
      typeof sessionRaw === "string" ? sessionRaw : null,
    );

    if (!sessionConfig?.sttModelId || !sessionConfig.language) {
      return NextResponse.json(
        { error: "Missing sessionConfig (sttModelId, language)" },
        { status: 400 },
      );
    }

    const catalogEntry = getCatalogEntry(sessionConfig.sttModelId);
    const assignmentIdRaw = formData.get("assignmentId");
    const assignmentId =
      typeof assignmentIdRaw === "string" && assignmentIdRaw.trim()
        ? assignmentIdRaw.trim()
        : null;
    const sttProviderApiKey =
      assignmentId && catalogEntry
        ? await resolveProviderApiKeyForAssignment(assignmentId, catalogEntry.providerId)
        : null;

    if (
      !catalogEntry ||
      (!sttProviderApiKey && !isProviderConfigured(catalogEntry.providerId))
    ) {
      return NextResponse.json(
        { error: "STT model unavailable or provider not configured" },
        { status: 400 },
      );
    }

    const segments = collectAudioSegments(formData);
    if (segments.length === 0) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 },
      );
    }

    const durationRaw = formData.get("recordingDurationMs");
    const recordingDurationMs =
      typeof durationRaw === "string" && durationRaw.trim()
        ? Number.parseInt(durationRaw, 10)
        : NaN;

    const isSarvam = sessionConfig.sttModelId === SARVAM_STT_CATALOG_MODEL_ID;
    const isChunked = isSarvam && segments.length > 1;

    if (
      isSarvam &&
      !isChunked &&
      Number.isFinite(recordingDurationMs) &&
      recordingDurationMs > SARVAM_STT_MAX_DURATION_MS
    ) {
      return NextResponse.json(
        {
          error: "Recording too long for Sarvam STT",
          details: `Sarvam supports up to ${SARVAM_STT_MAX_DURATION_MS / 1000} seconds per request. Longer recordings are split automatically on supported browsers.`,
        },
        { status: 400 },
      );
    }

    const stt = getSttProvider(sessionConfig.sttModelId);
    const apiModelId = getSpeechApiModelId(sessionConfig.sttModelId);

    /** Transcribe all segments for a given language hint, returning joined text. */
    const transcribeAll = async (language: string): Promise<string> => {
      if (isChunked) {
        const parts: string[] = [];
        for (const segment of segments) {
          const buffer = Buffer.from(await segment.arrayBuffer());
          if (buffer.length < 500) continue;
          const filename =
            segment instanceof File && segment.name
              ? segment.name
              : "recording.webm";
          const mimeType = segment.type || "audio/webm";
          const result = await withRetry(() =>
            stt.transcribe({
              audio: buffer,
              filename,
              mimeType,
              language,
              apiModelId,
              providerApiKey: sttProviderApiKey ?? undefined,
            }),
          3);
          const part = (result.text ?? "").trim();
          if (part) parts.push(part);
        }
        return parts.join(" ");
      }

      const audio = segments[0]!;
      const buffer = Buffer.from(await audio.arrayBuffer());
      if (buffer.length < 500) return "";
      const filename =
        audio instanceof File && audio.name ? audio.name : "recording.webm";
      const mimeType = audio.type || "audio/webm";
      const result = await withRetry(() =>
        stt.transcribe({
          audio: buffer,
          filename,
          mimeType,
          language,
          apiModelId,
          providerApiKey: sttProviderApiKey ?? undefined,
        }),
      3);
      return (result.text ?? "").trim();
    };

    const supportLanguage = sessionConfig.supportLanguage?.trim();
    const isDual =
      Boolean(supportLanguage) && supportLanguage !== sessionConfig.language;

    if (isDual) {
      // Parallel transcription: same audio, two language hints.
      const [primaryResult, supportResult] = await Promise.allSettled([
        transcribeAll(sessionConfig.language),
        transcribeAll(supportLanguage!),
      ]);

      const primaryText =
        primaryResult.status === "fulfilled" ? primaryResult.value : "";
      const supportText =
        supportResult.status === "fulfilled" ? supportResult.value : "";

      if (primaryResult.status === "rejected") {
        console.warn(
          "[konvo-voice/transcribe] primary language transcription failed:",
          primaryResult.reason,
        );
      }
      if (supportResult.status === "rejected") {
        console.warn(
          "[konvo-voice/transcribe] support language transcription failed:",
          supportResult.reason,
        );
      }

      const candidates: TranscribeCandidate[] = [];
      if (primaryText) candidates.push({ language: sessionConfig.language, text: primaryText });
      if (supportText) candidates.push({ language: supportLanguage!, text: supportText });

      console.log(
        `[konvo-voice/transcribe] dual primary=${sessionConfig.language} support=${supportLanguage} ` +
          `primaryLen=${primaryText.length} supportLen=${supportText.length}`,
      );

      if (candidates.length === 0) {
        return NextResponse.json(
          {
            error: "No speech detected",
            details:
              "The transcription service returned no text. The recording may be silent or unsupported.",
          },
          { status: 422 },
        );
      }

      if (candidates.length === 1) {
        // Only one reading succeeded — treat as single mode (no dual-pick needed).
        return NextResponse.json({ text: candidates[0]!.text } satisfies TranscribeResponse);
      }

      return NextResponse.json({
        text: primaryText,
        candidates,
      } satisfies TranscribeResponse);
    }

    // ── Single-language path (unchanged behavior) ──────────────────────────
    if (isChunked) {
      const parts: string[] = [];
      for (const segment of segments) {
        const buffer = Buffer.from(await segment.arrayBuffer());
        if (buffer.length < 500) continue;
        const filename =
          segment instanceof File && segment.name
            ? segment.name
            : "recording.webm";
        const mimeType = segment.type || "audio/webm";
        const result = await withRetry(() =>
          stt.transcribe({
            audio: buffer,
            filename,
            mimeType,
            language: sessionConfig.language,
            apiModelId,
            providerApiKey: sttProviderApiKey ?? undefined,
          }),
        3);
        const part = (result.text ?? "").trim();
        if (part) parts.push(part);
      }

      const text = parts.join(" ");
      console.log(
        `[konvo-voice/transcribe] provider=sarvam chunks=${segments.length} transcriptLen=${text.length}`,
      );

      if (!text) {
        return NextResponse.json(
          {
            error: "No speech detected",
            details:
              "The transcription service returned no text across all segments.",
          },
          { status: 422 },
        );
      }

      return NextResponse.json({ text });
    }

    const audio = segments[0]!;
    const buffer = Buffer.from(await audio.arrayBuffer());
    if (buffer.length < 500) {
      return NextResponse.json(
        {
          error: "Audio too short",
          details: "Recording was empty or too brief to transcribe.",
        },
        { status: 400 },
      );
    }

    const text = await transcribeAll(sessionConfig.language);
    if (!text) {
      return NextResponse.json(
        {
          error: "No speech detected",
          details:
            "The transcription service returned no text. The recording may be silent or unsupported.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[konvo-voice/transcribe]", error);
    return NextResponse.json(
      {
        error: "Failed to transcribe audio",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
