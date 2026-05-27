import { after, NextRequest, NextResponse } from "next/server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import {
  formatReasoningForConfig,
  providerOptionsForConfig,
} from "@/lib/ai/providerOptions";
import { getLanguageModel } from "@/lib/ai/provider";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import {
  aiKeySourceLogLabel,
  AiNotConfiguredError,
} from "@/lib/ai/credentials/resolve";
import { createChatStream, resolveChatStreamCall } from "@/lib/ai/chat-stream";
import { insertChatMessage } from "@/lib/queries/chatMessages";
import {
  DEFAULT_MAX_ATTEMPTS,
  isRetryableProviderError,
  waitBeforeRetry,
} from "@/lib/ai/retry";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import {
  completeAiInvocation,
  linkInvocationToChatMessage,
  scheduleAiInvocationStart,
  scheduleFailAiInvocation,
  setChatMessageInvocationId,
  usageFromAiSdkResult,
} from "@/lib/ai/logging/recordInvocation";
import {
  buildLoggedSdkResponse,
  buildLoggedStreamTextRequest,
} from "@/lib/ai/logging/serialize";
import { getCatalogEntry, isProviderConfigured } from "@/lib/konvo-voice/sessionCatalog";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import {
  CartesiaTtsContinuationSession,
} from "@/lib/konvo-voice/speech/providers/cartesia/ws-continuation";
import { CARTESIA_TTS_MIME } from "@/lib/konvo-voice/speech/providers/cartesia/tts";
import {
  SarvamTtsWebSocketSession,
  SARVAM_WS_TTS_MIME,
} from "@/lib/konvo-voice/speech/providers/sarvam/ws-stream";
import {
  getSpeechApiModelId,
  getTtsProvider,
} from "@/lib/konvo-voice/speech/registry";
import { sseEvent, sseHeaders } from "@/lib/konvo-voice/sse";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface MultimodalTurnMessage {
  role: "student" | "assistant";
  content: string;
}

interface MultimodalTurnRequestBody {
  assignmentId: string;
  submissionId?: string;
  questionOrder: number;
  messages: MultimodalTurnMessage[];
  attemptNumber?: number;
  system_prompt: string;
  greeting?: string;
  language: string;
  ttsModelId: string;
}

function shouldFlushFallbackTtsChunk(buffer: string): boolean {
  const trimmed = buffer.trim();
  if (!trimmed) return false;
  if (trimmed.length >= 120) return true;
  return /[.!?]["')\]]?\s*$/.test(trimmed);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MultimodalTurnRequestBody;
    const {
      assignmentId,
      submissionId,
      questionOrder,
      messages,
      attemptNumber,
      system_prompt: systemPrompt,
      greeting,
      language,
      ttsModelId,
    } = body;

    if (
      !assignmentId ||
      questionOrder === undefined ||
      !messages ||
      !systemPrompt ||
      !language?.trim() ||
      !ttsModelId
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const supabase = await createServerSupabaseClient();
    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    let resolved;
    try {
      resolved = await getCachedResolveModelConfig({
        classDbId,
        appFunctionKey: "text.chat_tutoring",
      });
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const { config, keySource } = resolved;
    console.log("[multimodal/turn]", {
      provider: config.provider,
      modelId: config.modelId,
      keySource,
      label: aiKeySourceLogLabel(keySource),
      reasoning: formatReasoningForConfig(config),
      ttsModelId,
      ttsProvider: ttsEntry.providerId,
    });

    const model = getLanguageModel(config);
    const providerOptions = providerOptionsForConfig(config);
    const aiMetadata = {
      aiKeySource: keySource,
      aiProvider: config.provider,
      aiModelId: config.modelId,
    };
    const invocationModel = modelMetaFromResolved(config, keySource);

    try {
      const studentMessages = messages.filter(
        (m) => m.role === "student" && m.content?.trim(),
      );
      const latestStudent = studentMessages[studentMessages.length - 1];
      if (latestStudent) {
        await insertChatMessage(supabase, {
          submission_id: submissionId ?? null,
          assignment_id: assignmentId,
          question_order: questionOrder,
          role: "student",
          content: latestStudent.content,
          attempt_number: attemptNumber ?? null,
        });
      }
    } catch (error) {
      console.error("[multimodal/turn] Failed to log student chat message:", error);
    }

    const sdkMessages = messages.map((msg) => ({
      role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    }));

    const tts = getTtsProvider(ttsModelId);
    const useCartesiaWs = tts.id === "cartesia";
    const useSarvamWs = tts.id === "sarvam";
    const useStreamingWs = useCartesiaWs || useSarvamWs;
    const { mimeType, sampleRate } = tts.streamFormat;
    const abortSignal = request.signal;
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEvent(data)));
        };

        let fullReply = "";
        let endConversationReason: string | null = null;
        let firstInvocationId: string | null = null;
        let winningInvocationId: string | null = null;
        let winningStartedAtMs: number | undefined;
        let lastStreamResult: ReturnType<typeof createChatStream> | null = null;
        let cartesiaSession: CartesiaTtsContinuationSession | null = null;
        let sarvamSession: SarvamTtsWebSocketSession | null = null;
        let speechStartSent = false;
        let pendingFallbackTts = "";
        let audioPump: Promise<void> | null = null;
        let aborted = false;

        const onAbort = () => {
          aborted = true;
          cartesiaSession?.cancelContext();
          sarvamSession?.close();
        };
        abortSignal.addEventListener("abort", onAbort);

        const ensureSpeechStart = () => {
          if (speechStartSent) return;
          speechStartSent = true;
          const wsMimeType = useCartesiaWs
            ? CARTESIA_TTS_MIME
            : useSarvamWs
              ? SARVAM_WS_TTS_MIME
              : mimeType;
          const wsSampleRate = useCartesiaWs
            ? cartesiaSession?.sampleRate ?? sampleRate
            : useSarvamWs
              ? sarvamSession?.sampleRate ?? sampleRate
              : sampleRate;
          enqueue({
            type: "speech_start",
            index: 0,
            mimeType: useStreamingWs ? wsMimeType : mimeType,
            sampleRate: useStreamingWs ? wsSampleRate : sampleRate,
          });
        };

        const enqueueSpeechChunk = (chunk: Uint8Array) => {
          ensureSpeechStart();
          enqueue({
            type: "speech_chunk",
            index: 0,
            base64: Buffer.from(chunk).toString("base64"),
          });
        };

        const flushFallbackTts = async (text: string, continueGeneration: boolean) => {
          const trimmed = text.trim();
          if (!trimmed && !continueGeneration) return;

          const synthInput = {
            text: trimmed,
            language,
            voice,
            apiModelId: getSpeechApiModelId(ttsModelId),
            continueGeneration,
          };

          if (tts.synthesizeStream) {
            for await (const chunk of tts.synthesizeStream(synthInput)) {
              if (aborted) return;
              enqueueSpeechChunk(chunk);
            }
          } else {
            const result = await tts.synthesize(synthInput);
            if (aborted) return;
            enqueueSpeechChunk(new Uint8Array(result.audio));
          }

        };

        const pushFallbackTtsDelta = async (delta: string) => {
          pendingFallbackTts += delta;
          if (shouldFlushFallbackTtsChunk(pendingFallbackTts)) {
            const flushText = pendingFallbackTts;
            pendingFallbackTts = "";
            await flushFallbackTts(flushText, true);
          }
        };

        const finalizeFallbackTts = async () => {
          if (pendingFallbackTts.trim()) {
            await flushFallbackTts(pendingFallbackTts, false);
            pendingFallbackTts = "";
          } else if (speechStartSent) {
            enqueue({ type: "speech_end", index: 0 });
          }
        };

        const startAudioPump = (
          source: AsyncIterable<Uint8Array>,
        ): Promise<void> =>
          (async () => {
            try {
              for await (const chunk of source) {
                if (aborted) return;
                enqueueSpeechChunk(chunk);
              }
              if (speechStartSent && !aborted) {
                enqueue({ type: "speech_end", index: 0 });
              }
            } catch (audioError) {
              if (!aborted) {
                const message =
                  audioError instanceof Error
                    ? audioError.message
                    : "TTS audio stream failed";
                enqueue({ type: "error", error: message });
              }
            }
          })();

        try {
          if (useCartesiaWs) {
            cartesiaSession = await CartesiaTtsContinuationSession.open({
              modelId: getSpeechApiModelId(ttsModelId) ?? "sonic-3.5",
              voiceId: voice,
              language,
            });
            audioPump = startAudioPump(cartesiaSession.consumeAudio());
          } else if (useSarvamWs) {
            sarvamSession = await SarvamTtsWebSocketSession.open({
              modelId: getSpeechApiModelId(ttsModelId) ?? "bulbul:v3",
              speaker: voice,
              language,
            });
            audioPump = startAudioPump(sarvamSession.consumeAudio());
          }

          const streamCallBase = {
            systemPrompt,
            greeting,
            messages: sdkMessages,
            providerOptions,
          };

          attemptLoop: for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt++) {
            if (aborted) break attemptLoop;

            const startedAtMs = Date.now();
            const resolvedCall = resolveChatStreamCall(streamCallBase);
            const invocationId = scheduleAiInvocationStart({
              appFunctionKey: "text.chat_tutoring",
              classId: classDbId,
              assignmentId,
              submissionId: submissionId ?? null,
              questionOrder,
              attemptNumber: attemptNumber ?? null,
              model: invocationModel,
              sdkRequest: buildLoggedStreamTextRequest({
                system: resolvedCall.system,
                messages: resolvedCall.messages,
                tools: resolvedCall.tools,
                toolChoice: resolvedCall.toolChoice,
                stopWhen: resolvedCall.stopWhen,
                providerOptions: resolvedCall.providerOptions,
              }),
              retryOf: firstInvocationId,
              retryIndex: attempt,
            });
            if (invocationId && attempt === 0) {
              firstInvocationId = invocationId;
            }

            const result = createChatStream({
              model,
              ...streamCallBase,
            });
            lastStreamResult = result;
            let deliveredToClient = false;

            try {
              for await (const part of result.fullStream) {
                if (aborted) break attemptLoop;

                switch (part.type) {
                  case "text-delta": {
                    fullReply += part.text;
                    deliveredToClient = true;
                    enqueue({ type: "text-delta", content: part.text });

                    if (useCartesiaWs && cartesiaSession) {
                      cartesiaSession.pushTranscript(part.text, true);
                    } else if (useSarvamWs && sarvamSession) {
                      sarvamSession.pushText(part.text);
                    } else {
                      await pushFallbackTtsDelta(part.text);
                    }
                    break;
                  }
                  case "tool-call": {
                    if (part.toolName === "end_conversation") {
                      const input = part.input as {
                        reason?: string;
                        message?: string;
                      };
                      const reason =
                        input.reason === "refusal" ? "refusal" : "thorough";
                      endConversationReason = reason;
                      const message = input.message ?? "";

                      if (message) {
                        fullReply += message;
                        deliveredToClient = true;
                        enqueue({ type: "text-delta", content: message });
                        if (useCartesiaWs && cartesiaSession) {
                          cartesiaSession.pushTranscript(message, true);
                        } else if (useSarvamWs && sarvamSession) {
                          sarvamSession.pushText(message);
                        } else {
                          await pushFallbackTtsDelta(message);
                        }
                      }
                      deliveredToClient = true;
                      enqueue({ type: "end_conversation", reason });
                    }
                    break;
                  }
                  case "error": {
                    const streamErr = part.error;
                    if (
                      !deliveredToClient &&
                      isRetryableProviderError(streamErr) &&
                      attempt < DEFAULT_MAX_ATTEMPTS - 1
                    ) {
                      if (invocationId) {
                        scheduleFailAiInvocation(invocationId, streamErr, startedAtMs);
                      }
                      await waitBeforeRetry(streamErr, attempt);
                      continue attemptLoop;
                    }
                    const errMsg =
                      streamErr instanceof Error
                        ? streamErr.message
                        : "Unknown streaming error";
                    if (invocationId) {
                      scheduleFailAiInvocation(invocationId, streamErr, startedAtMs);
                    }
                    deliveredToClient = true;
                    enqueue({ type: "error", error: errMsg });
                    break;
                  }
                  default:
                    break;
                }
              }

              if (invocationId) {
                winningInvocationId = invocationId;
                winningStartedAtMs = startedAtMs;
              }
              break attemptLoop;
            } catch (err) {
              if (
                !deliveredToClient &&
                isRetryableProviderError(err) &&
                attempt < DEFAULT_MAX_ATTEMPTS - 1
              ) {
                if (invocationId) {
                  scheduleFailAiInvocation(invocationId, err, startedAtMs);
                }
                await waitBeforeRetry(err, attempt);
                continue attemptLoop;
              }
              const errMsg =
                err instanceof Error ? err.message : "Unknown streaming error";
              if (invocationId) {
                scheduleFailAiInvocation(invocationId, err, startedAtMs);
              }
              if (!deliveredToClient) {
                enqueue({ type: "error", error: errMsg });
              }
              break attemptLoop;
            }
          }

          if (!aborted) {
            if (useCartesiaWs && cartesiaSession) {
              cartesiaSession.pushTranscript("", false);
              await audioPump;
            } else if (useSarvamWs && sarvamSession) {
              sarvamSession.flush();
              await audioPump;
            } else {
              await finalizeFallbackTts();
            }
          }

          enqueue({ type: "done" });

          if (fullReply.trim()) {
            try {
              const chatMessageId = await insertChatMessage(supabase, {
                submission_id: submissionId ?? null,
                assignment_id: assignmentId,
                question_order: questionOrder,
                role: "assistant",
                content: fullReply,
                attempt_number: attemptNumber ?? null,
                aiMetadata,
              });

              if (winningInvocationId) {
                const invId = winningInvocationId;
                const startedAt = winningStartedAtMs;
                const streamResult = lastStreamResult;

                after(async () => {
                  try {
                    if (chatMessageId) {
                      await setChatMessageInvocationId(chatMessageId, invId);
                      await linkInvocationToChatMessage(invId, chatMessageId);
                    }
                    const sdkResponse = streamResult
                      ? await buildLoggedSdkResponse(streamResult)
                      : null;
                    const usage = streamResult
                      ? await usageFromAiSdkResult(streamResult)
                      : null;
                    const finishReason =
                      sdkResponse &&
                      typeof sdkResponse === "object" &&
                      sdkResponse !== null &&
                      "finishReason" in sdkResponse
                        ? (sdkResponse.finishReason as string | null)
                        : null;
                    await completeAiInvocation(
                      invId,
                      {
                        sdkResponse: sdkResponse ?? {
                          text: fullReply,
                          endConversationReason,
                        },
                        usage,
                        finishReason,
                      },
                      startedAt,
                    );
                  } catch (logErr) {
                    console.error(
                      "[multimodal/turn] AI invocation logging failed:",
                      logErr,
                    );
                  }
                });
              }
            } catch (error) {
              console.error("[multimodal/turn] Failed to log assistant chat message:", error);
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Multimodal turn failed";
          enqueue({ type: "error", error: message });
          enqueue({ type: "done" });
        } finally {
          abortSignal.removeEventListener("abort", onAbort);
          cartesiaSession?.close();
          sarvamSession?.close();
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders() });
  } catch (error) {
    console.error("[multimodal/turn]", error);
    return NextResponse.json(
      {
        error: "Failed to run multimodal turn",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
