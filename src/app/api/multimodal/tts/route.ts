import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry } from "@/lib/konvo-voice/sessionCatalog";
import { sseEvent, sseHeaders } from "@/lib/konvo-voice/sse";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { resolveMeteredSpeech, type AiCallContext } from "@/lib/ai/gateway";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
    if (!ttsEntry) {
      return NextResponse.json(
        { error: "Selected TTS model unavailable or provider not configured" },
        { status: 400 },
      );
    }

    const resolvedAssignmentId = assignmentId?.trim() || null;
    const classDbId = resolvedAssignmentId
      ? await getClassDbIdForAssignment(await createServerSupabaseClient(), resolvedAssignmentId)
      : null;
    const speechContext: AiCallContext = { classDbId, assignmentId: resolvedAssignmentId };
    const ttsClient = await resolveMeteredSpeech({
      kind: "tts",
      catalogEntry: ttsEntry,
      assignmentId: resolvedAssignmentId,
      context: speechContext,
    });

    let voice: string;
    try {
      voice = resolveTtsVoice(ttsModelId, language);
    } catch (error) {
      if (error instanceof KonvoLocaleVoiceError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

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
            mimeType: ttsClient.streamFormat.mimeType,
            sampleRate: ttsClient.streamFormat.sampleRate,
          });

          const synthInput = {
            text: trimmed,
            contextId,
            continueGeneration,
            language,
            voice,
          };

          if (!trimmed && continueGeneration === false) {
            // Final continuation close signal with no additional transcript content.
          } else if (ttsClient.synthesizeStream) {
            for await (const chunk of ttsClient.synthesizeStream(synthInput)) {
              enqueue({
                type: "speech_chunk",
                index: safeIndex,
                base64: Buffer.from(chunk).toString("base64"),
              });
            }
          } else {
            const result = await ttsClient.synthesize(synthInput);
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
