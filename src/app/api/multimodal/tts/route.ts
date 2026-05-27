import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry, isProviderConfigured } from "@/lib/konvo-voice/sessionCatalog";
import { getSpeechApiModelId, getTtsProvider } from "@/lib/konvo-voice/speech/registry";
import { sseEvent, sseHeaders } from "@/lib/konvo-voice/sse";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { resolveProviderApiKeyForAssignment } from "@/lib/konvo-voice/speech/resolveProviderKey";

interface MultimodalTtsBody {
  ttsModelId: string;
  text: string;
  language: string;
  assignmentId?: string;
  contextId?: string;
  continueGeneration?: boolean;
  index?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MultimodalTtsBody;
    const {
      ttsModelId,
      text,
      language,
      assignmentId,
      contextId,
      continueGeneration,
      index,
    } = body;
    if (!ttsModelId || !language?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: ttsModelId, language" },
        { status: 400 },
      );
    }

    const ttsEntry = getCatalogEntry(ttsModelId);
    const ttsProviderApiKey =
      assignmentId && ttsEntry
        ? await resolveProviderApiKeyForAssignment(assignmentId, ttsEntry.providerId)
        : null;
    if (!ttsEntry || (!ttsProviderApiKey && !isProviderConfigured(ttsEntry.providerId))) {
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
          const safeIndex = typeof index === "number" && index >= 0 ? index : 0;
          const trimmed = (text ?? "").trim();
          enqueue({
            type: "speech_start",
            index: safeIndex,
            mimeType: tts.streamFormat.mimeType,
            sampleRate: tts.streamFormat.sampleRate,
          });

          const synthInput = {
            text: trimmed,
            contextId,
            continueGeneration,
            language,
            voice,
            apiModelId: getSpeechApiModelId(ttsModelId),
            providerApiKey: ttsProviderApiKey ?? undefined,
          };

          if (!trimmed && continueGeneration === false) {
            // Final continuation close signal with no additional transcript content.
          } else if (tts.synthesizeStream) {
            for await (const chunk of tts.synthesizeStream(synthInput)) {
              enqueue({
                type: "speech_chunk",
                index: safeIndex,
                base64: Buffer.from(chunk).toString("base64"),
              });
            }
          } else {
            const result = await tts.synthesize(synthInput);
            enqueue({
              type: "speech_chunk",
              index: safeIndex,
              base64: result.audio.toString("base64"),
            });
          }

          enqueue({ type: "speech_end", index: safeIndex });
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
