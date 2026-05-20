import { NextRequest, NextResponse } from "next/server";
import {
  getSpeechApiModelId,
  getSttProvider,
} from "@/lib/prototype/konvo-voice/speech/registry";
import type { KonvoSessionConfig } from "@/lib/prototype/konvo-voice/sessionConfig";
import { isProviderConfigured } from "@/lib/prototype/konvo-voice/sessionCatalog";
import { getCatalogEntry } from "@/lib/prototype/konvo-voice/sessionCatalog";

function parseSessionConfig(raw: string | null): KonvoSessionConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KonvoSessionConfig;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
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
    if (!catalogEntry || !isProviderConfigured(catalogEntry.providerId)) {
      return NextResponse.json(
        { error: "STT model unavailable or provider not configured" },
        { status: 400 },
      );
    }

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 },
      );
    }

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

    const filename =
      audio instanceof File && audio.name ? audio.name : "recording.webm";
    const mimeType = audio.type || "audio/webm";

    const stt = getSttProvider(sessionConfig.sttModelId);
    const result = await stt.transcribe({
      audio: buffer,
      filename,
      mimeType,
      language: sessionConfig.language,
      apiModelId: getSpeechApiModelId(sessionConfig.sttModelId),
    });

    const text = (result.text ?? "").trim();
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
