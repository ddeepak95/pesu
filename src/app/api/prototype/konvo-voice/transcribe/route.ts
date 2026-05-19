import { NextRequest, NextResponse } from "next/server";
import { getSttProvider } from "@/lib/prototype/konvo-voice/speech/registry";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

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

    const stt = getSttProvider();
    const result = await stt.transcribe({
      audio: buffer,
      filename,
      mimeType,
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
