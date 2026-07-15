import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry } from "@/lib/konvo-voice/sessionCatalog";
import { sseEvent, sseHeaders } from "@/lib/konvo-voice/sse";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import {
  resolveMeteredSpeech,
  runWithAiContext,
  type AiCallContext,
} from "@/lib/ai/gateway";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { catalogNotConfiguredResponse } from "@/lib/ai/credentials/resolveCatalogConfig";
import { quotaExceededResponse } from "@/lib/ai/metering/quota";

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
    const supabase = await createServerSupabaseClient();
    const classDbId = resolvedAssignmentId
      ? await getClassDbIdForAssignment(supabase, resolvedAssignmentId)
      : null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    return await runWithAiContext({ userId, classId: classDbId }, async () => {
      const speechContext: AiCallContext = {
        classDbId,
        assignmentId: resolvedAssignmentId,
        // Session-internal TTS call (on-demand/lazy synthesis) for an
        // already-admitted session (D6) — no separate per-call check.
        admittedAtSessionStart: true,
      };
      let ttsClient;
      try {
        ttsClient = await resolveMeteredSpeech({
          kind: "tts",
          catalogEntry: ttsEntry,
          assignmentId: resolvedAssignmentId,
          context: speechContext,
        });
      } catch (error) {
        const notConfigured = catalogNotConfiguredResponse(error);
        if (notConfigured) {
          return NextResponse.json(notConfigured.body, { status: notConfigured.status });
        }
        const quotaBlocked = quotaExceededResponse(error);
        if (quotaBlocked) {
          return NextResponse.json(quotaBlocked.body, { status: quotaBlocked.status });
        }
        throw error;
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
    });
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
