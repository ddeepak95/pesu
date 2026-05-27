import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry, isProviderConfigured } from "@/lib/prototype/konvo-voice/sessionCatalog";
import { getSpeechApiModelId, getTtsProvider } from "@/lib/prototype/konvo-voice/speech/registry";
import { sseEvent, sseHeaders } from "@/lib/prototype/konvo-voice/sse";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/prototype/konvo-voice/konvoLocaleCapabilitiesHelpers";

interface MultimodalTtsBody {
  ttsModelId: string;
  text: string;
  language: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MultimodalTtsBody;
    const { ttsModelId, text, language } = body;
    if (!ttsModelId || !text?.trim() || !language?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: ttsModelId, text, language" },
        { status: 400 },
      );
    }

    const ttsEntry = getCatalogEntry(ttsModelId);
    if (!ttsEntry || !isProviderConfigured(ttsEntry.providerId)) {
      return NextResponse.json(
        { error: "Selected TTS model unavailable or provider not configured" },
        { status: 400 },
      );
    }

    let voice: string;
    try {
      voice = resolveTtsVoice(ttsModelId, language);
    } catch (error) {
      if (error instanceof KonvoLocaleVoiceError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const tts = getTtsProvider(ttsModelId);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEvent(data)));
        };

        try {
          enqueue({
            type: "speech_start",
            index: 0,
            mimeType: tts.streamFormat.mimeType,
            sampleRate: tts.streamFormat.sampleRate,
          });

          const synthInput = {
            text: text.trim(),
            language,
            voice,
            apiModelId: getSpeechApiModelId(ttsModelId),
          };

          if (tts.synthesizeStream) {
            for await (const chunk of tts.synthesizeStream(synthInput)) {
              enqueue({
                type: "speech_chunk",
                index: 0,
                base64: Buffer.from(chunk).toString("base64"),
              });
            }
          } else {
            const result = await tts.synthesize(synthInput);
            enqueue({
              type: "speech_chunk",
              index: 0,
              base64: result.audio.toString("base64"),
            });
          }

          enqueue({ type: "speech_end", index: 0 });
          enqueue({ type: "done" });
        } catch (error) {
          enqueue({
            type: "error",
            message: error instanceof Error ? error.message : "TTS synthesis failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders() });
  } catch (error) {
    console.error("[multimodal/tts]", error);
    return NextResponse.json(
      {
        error: "Failed to synthesize speech",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
