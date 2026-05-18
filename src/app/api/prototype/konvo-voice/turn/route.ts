import { NextRequest, NextResponse } from "next/server";
import { resolveEnvModelConfig } from "@/lib/ai/credentials/resolve";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import { generateStructured } from "@/lib/ai/structured";
import { buildTurnMessages, segmentsToAssistantText } from "@/lib/prototype/konvo-voice/prompt";
import { botTurnSchema, type BotSegment } from "@/lib/prototype/konvo-voice/schema";
import { sseEvent, sseHeaders } from "@/lib/prototype/konvo-voice/sse";
import { getTtsProvider } from "@/lib/prototype/konvo-voice/speech/registry";

interface TurnRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  init?: boolean;
}

function normalizeSegments(raw: BotSegment[] | undefined): BotSegment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((segment) => {
      if (segment?.type === "speech") {
        const text =
          typeof segment.text === "string" ? segment.text.trim() : "";
        if (!text) return null;
        return { type: "speech" as const, text };
      }
      if (segment?.type === "content" && segment.title) {
        return {
          type: "content" as const,
          kind: segment.kind ?? "article",
          title: String(segment.title),
          description: segment.description
            ? String(segment.description)
            : undefined,
          url: segment.url ? String(segment.url) : undefined,
        };
      }
      return null;
    })
    .filter((s): s is BotSegment => s !== null);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TurnRequestBody;
    const { messages = [], init } = body;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEvent(data)));
        };

        try {
          enqueue({ type: "thinking" });

          const { config } = resolveEnvModelConfig();
          const model = getLanguageModel(config);
          const providerOptions = providerOptionsForConfig(config);

          const turnMessages = buildTurnMessages(messages, init);
          const output = await generateStructured({
            model,
            schema: botTurnSchema,
            messages: turnMessages,
            providerOptions,
          });

          let segments = normalizeSegments(output.segments);
          if (segments.length === 0) {
            segments = [
              {
                type: "speech",
                text: "Hi! I'm Konvo. I'm ready when you are — tap the microphone and tell me what you'd like to explore.",
              },
            ];
          }
          enqueue({ type: "segments", segments });

          for (const segment of segments) {
            if (segment.type === "content") {
              enqueue({ type: "content", segment });
            }
          }

          const tts = getTtsProvider();
          const speechSegments = segments.filter(
            (s): s is { type: "speech"; text: string } =>
              s.type === "speech" && Boolean(s.text?.trim()),
          );

          let speechIndex = 0;
          for (const s of speechSegments) {
            const text = s.text.trim();

            enqueue({
              type: "speech_start",
              index: speechIndex,
              mimeType: "audio/mpeg",
            });

            if (tts.synthesizeStream) {
              for await (const chunk of tts.synthesizeStream({ text })) {
                enqueue({
                  type: "speech_chunk",
                  index: speechIndex,
                  base64: Buffer.from(chunk).toString("base64"),
                });
              }
            } else {
              const result = await tts.synthesize({ text });
              enqueue({
                type: "speech_chunk",
                index: speechIndex,
                base64: result.audio.toString("base64"),
              });
            }

            enqueue({ type: "speech_end", index: speechIndex });
            speechIndex += 1;
          }

          enqueue({
            type: "assistant_text",
            text: segmentsToAssistantText(segments),
          });
          enqueue({ type: "done" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Turn failed";
          enqueue({ type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders() });
  } catch (error) {
    console.error("[konvo-voice/turn]", error);
    return NextResponse.json(
      {
        error: "Failed to process turn",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
