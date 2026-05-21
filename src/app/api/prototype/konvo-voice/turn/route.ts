import { NextRequest, NextResponse } from "next/server";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import { generateStructured } from "@/lib/ai/structured";
import { buildTurnMessages, segmentsToAssistantText } from "@/lib/prototype/konvo-voice/prompt";
import { resolvePrototypeModelConfig } from "@/lib/prototype/konvo-voice/resolvePrototypeModel";
import { botTurnSchema, type BotSegment } from "@/lib/prototype/konvo-voice/schema";
import type { KonvoSessionConfig } from "@/lib/prototype/konvo-voice/sessionConfig";
import { getCatalogEntry, isProviderConfigured } from "@/lib/prototype/konvo-voice/sessionCatalog";
import { sseEvent, sseHeaders } from "@/lib/prototype/konvo-voice/sse";
import {
  getSpeechApiModelId,
  getTtsProvider,
} from "@/lib/prototype/konvo-voice/speech/registry";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/prototype/konvo-voice/konvoLocaleCapabilitiesHelpers";

interface TurnRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  init?: boolean;
  system_prompt?: string;
  greeting?: string;
  sessionConfig?: KonvoSessionConfig;
}

function speechTextFromSegment(
  segment: Record<string, unknown>,
): string {
  for (const key of ["text", "content", "message", "speech"] as const) {
    const value = segment[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeSegments(raw: BotSegment[] | undefined): BotSegment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((segment) => {
      if (segment?.type === "speech") {
        const text = speechTextFromSegment(
          segment as unknown as Record<string, unknown>,
        );
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
    const {
      messages = [],
      init,
      system_prompt: systemPrompt,
      greeting,
      sessionConfig,
    } = body;

    if (!sessionConfig?.sttModelId || !sessionConfig.ttsModelId || !sessionConfig.llmModelId || !sessionConfig.language) {
      return NextResponse.json(
        { error: "Missing sessionConfig (language, sttModelId, ttsModelId, llmModelId)" },
        { status: 400 },
      );
    }

    if (!systemPrompt?.trim()) {
      return NextResponse.json(
        { error: "Missing system_prompt" },
        { status: 400 },
      );
    }

    const llmEntry = getCatalogEntry(sessionConfig.llmModelId);
    const ttsEntry = getCatalogEntry(sessionConfig.ttsModelId);
    if (
      !llmEntry ||
      !ttsEntry ||
      !isProviderConfigured(llmEntry.providerId) ||
      !isProviderConfigured(ttsEntry.providerId)
    ) {
      return NextResponse.json(
        { error: "Selected models unavailable or provider not configured" },
        { status: 400 },
      );
    }

    let ttsVoice: string;
    try {
      ttsVoice = resolveTtsVoice(
        sessionConfig.ttsModelId,
        sessionConfig.language,
      );
    } catch (e) {
      if (e instanceof KonvoLocaleVoiceError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEvent(data)));
        };

        try {
          enqueue({ type: "thinking" });

          const config = resolvePrototypeModelConfig(sessionConfig.llmModelId);
          const model = getLanguageModel(config);
          const providerOptions = providerOptionsForConfig(config);

          const turnMessages = buildTurnMessages(messages, {
            init,
            systemPrompt: systemPrompt.trim(),
            greeting,
          });
          const output = await generateStructured({
            model,
            schema: botTurnSchema,
            messages: turnMessages,
            providerOptions,
          });

          console.log(
            `[konvo-voice/turn] init=${Boolean(init)} llmModel=${sessionConfig.llmModelId} rawSegments=${JSON.stringify(output.segments)?.slice(0, 800)}`,
          );

          let segments = normalizeSegments(output.segments);
          if (segments.length === 0) {
            console.warn(
              `[konvo-voice/turn] LLM returned no usable segments (init=${Boolean(init)}). Using fallback.`,
            );
            const fallbackText = init
              ? "Hi! I'm Konvo. I'm ready when you are — tap the microphone and tell me what you'd like to explore."
              : "Sorry, I didn't quite catch that. Could you say it again?";
            segments = [{ type: "speech", text: fallbackText }];
          }
          enqueue({ type: "segments", segments });

          for (const segment of segments) {
            if (segment.type === "content") {
              enqueue({ type: "content", segment });
            }
          }

          const tts = getTtsProvider(sessionConfig.ttsModelId);
          const { mimeType, sampleRate } = tts.streamFormat;
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
              mimeType,
              sampleRate,
            });

            const synthInput = {
              text,
              voice: ttsVoice,
              language: sessionConfig.language,
              apiModelId: getSpeechApiModelId(sessionConfig.ttsModelId),
            };

            if (tts.synthesizeStream) {
              for await (const chunk of tts.synthesizeStream(synthInput)) {
                enqueue({
                  type: "speech_chunk",
                  index: speechIndex,
                  base64: Buffer.from(chunk).toString("base64"),
                });
              }
            } else {
              const result = await tts.synthesize(synthInput);
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
