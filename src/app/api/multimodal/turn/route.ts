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
import {
  createMultimodalTurnStream,
  resolveMultimodalTurnCall,
  TURN_SCHEMA_NAME,
} from "@/lib/ai/chat-stream-object";
import { dispatchAction } from "@/lib/multimodal/actions/dispatcher";
import { getActionDefinition } from "@/lib/multimodal/actions/registry";
import type { ActionInput } from "@/lib/multimodal/actions/schema";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { EndConversationConfig } from "@/lib/multimodal/turnConfig";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
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
  buildLoggedStreamObjectRequest,
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
import { resolveProviderApiKeyForAssignment } from "@/lib/konvo-voice/speech/resolveProviderKey";
import { sseEvent, sseHeaders } from "@/lib/konvo-voice/sse";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface MultimodalTurnMessage {
  /**
   * Client-minted stable id for this bubble. When the latest student message
   * carries one, it becomes the chat_messages primary key so the student's
   * audio (voice_messages.chat_message_id) links back by FK.
   */
  id?: string;
  role: "student" | "assistant";
  content: string;
  /**
   * Hidden context (e.g. an MCQ result note) — sent to the LLM but never
   * persisted to chat_messages, since it may contain the correct answer.
   */
  hidden?: boolean;
}

interface TranscriptCandidate {
  language: string;
  text: string;
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
  /**
   * Language this turn's speech should be spoken in. Defaults to `language`.
   * Set to the support language for a language-support turn so the TTS voice
   * matches and the model is instructed to respond in that language.
   */
  speechLanguage?: string;
  /**
   * The support language available this turn (when language support is enabled
   * but the turn is spoken normally). Lets the orchestrator offer to switch if
   * the learner verbally asks for help.
   */
  supportLanguageAvailable?: string;
  /**
   * True when this is a speaking-practice scenario intro spoken in the support
   * language (briefing + "ready?"). The TTS still uses `speechLanguage`, but the
   * "learner asked for help" support directive is suppressed — the greeting
   * instruction drives the briefing.
   */
  introBrief?: boolean;
  ttsModelId: string;
  availableActions?: ActionKind[];
  endConversationConfig?: EndConversationConfig;
  /**
   * When true, the turn produces no spoken speech (e.g. a silent action-only
   * turn like suggested_response). Skips opening the TTS session entirely.
   */
  noSpeech?: boolean;
  /**
   * Client-minted id for the assistant turn's bubble. Used as the chat_messages
   * primary key for the assistant message so the bot audio links back by FK.
   */
  assistantMessageId?: string;
  /** Activity type — varies the multimodal + language-support directives. */
  activityType?: ActivityTypeKind;
  /**
   * When the latest student utterance was transcribed in two languages in parallel,
   * both candidates are passed here so the model can pick the coherent one.
   * Must have exactly 2 entries; first entry corresponds to the primary language.
   */
  latestTranscriptCandidates?: TranscriptCandidate[];
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
      availableActions,
      endConversationConfig,
      assistantMessageId,
    } = body;

    const enabledActions: ActionKind[] = availableActions ?? [];

    // The latest message's client-minted id, used as the chat_messages primary
    // key when that message is a persisted student turn so its audio links by FK.
    const latestMessageId = messages[messages.length - 1]?.id;

    // The language this turn is spoken in (support language when the learner
    // asked for help, otherwise the conversation language).
    const speechLanguage = body.speechLanguage?.trim() || language;
    const isSupportTurn = speechLanguage !== language;
    // A speaking-practice intro brief is spoken in the support language but is
    // not a "learner asked for help" turn — suppress the active support directive.
    const introBrief = body.introBrief === true;

    // Support is offered (but not active this turn): the orchestrator may raise
    // `requestLanguageHelp` if the learner verbally asks for help.
    const supportAvail = body.supportLanguageAvailable?.trim();
    const languageHelpAvailable =
      !!supportAvail && supportAvail !== language && !isSupportTurn;
    const localeLabel = (code: string) =>
      getLocaleRegistryMap().get(code)?.label ?? code;

    // Dual-transcript mode: the latest student message was transcribed in two
    // languages. The model picks the coherent reading via the `userTranscript` field.
    const candidates = body.latestTranscriptCandidates;
    const dualTranscriptDescriptor =
      Array.isArray(candidates) && candidates.length >= 2
        ? {
            primaryLabel: localeLabel(candidates[0]!.language),
            supportLabel: localeLabel(candidates[1]!.language),
          }
        : undefined;

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
    const ttsProviderApiKey = ttsEntry
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
      voice = resolveTtsVoice(ttsModelId, speechLanguage);
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

    // In single-transcript mode, log the student message upfront (existing behavior).
    // In dual-transcript mode, we defer until the model resolves `userTranscript`.
    if (!dualTranscriptDescriptor) {
      try {
        const latestMessage = messages[messages.length - 1];
        const latestStudent =
          latestMessage?.role === "student" &&
          latestMessage.content?.trim() &&
          !latestMessage.hidden
            ? latestMessage
            : null;
        if (latestStudent) {
          await insertChatMessage(supabase, {
            id: latestMessageId,
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
    }

    // Build SDK messages. In dual mode, replace the last user message with the
    // both-candidates payload so the model can choose the coherent reading.
    const sdkMessages = messages.map((msg, idx) => {
      const isLast = idx === messages.length - 1;
      const isDualUserMessage =
        isLast &&
        msg.role === "student" &&
        dualTranscriptDescriptor &&
        Array.isArray(candidates) &&
        candidates.length >= 2;

      if (isDualUserMessage) {
        const primaryLabel = dualTranscriptDescriptor!.primaryLabel;
        const supportLabel = dualTranscriptDescriptor!.supportLabel;
        const primaryText = candidates![0]!.text;
        const supportText = candidates![1]!.text;
        const dualContent =
          `[Your audio was transcribed two ways because two languages are active. ` +
          `Exactly one reading is coherent — pick it, ignore the other. ` +
          `Set \`userTranscript\` to the reading you chose (verbatim; fix only obvious mis-recognitions), ` +
          `then reply to it.]\n` +
          `- As ${primaryLabel}: ${primaryText}\n` +
          `- As ${supportLabel}: ${supportText}`;
        return { role: "user" as const, content: dualContent };
      }

      return {
        role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      };
    });

    const tts = getTtsProvider(ttsModelId);
    const noSpeech = body.noSpeech === true;
    const useCartesiaWs = !noSpeech && tts.id === "cartesia";
    const useSarvamWs = !noSpeech && tts.id === "sarvam";
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
        let resolvedAction: ActionInput | null = null;
        let firstInvocationId: string | null = null;
        // Dual-transcript tracking: emit `user_transcript` SSE once the model resolves it.
        // We track the last-seen partial value and flush it the moment speech starts
        // streaming — at that point the JSON parser has moved past `userTranscript`,
        // meaning the field is complete.
        let userTranscriptEmitted = false;
        let lastPartialUserTranscript = "";
        let winningInvocationId: string | null = null;
        let winningStartedAtMs: number | undefined;
        let lastStreamResult: ReturnType<
          typeof createMultimodalTurnStream
        > | null = null;
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
            language: speechLanguage,
            voice,
            apiModelId: getSpeechApiModelId(ttsModelId),
            providerApiKey: ttsProviderApiKey ?? undefined,
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
          if (noSpeech) return;
          if (pendingFallbackTts.trim()) {
            await flushFallbackTts(pendingFallbackTts, false);
            pendingFallbackTts = "";
          }
          if (speechStartSent && !aborted) {
            enqueue({ type: "speech_end", index: 0 });
          }
        };

        // Send a chunk of speech text to the client + the active TTS path.
        // Shared by the streaming loop and the final-object flush.
        const pushSpeechDelta = async (delta: string) => {
          if (!delta) return;
          fullReply += delta;
          // noSpeech turns: accumulate text for persistence but emit neither
          // text-delta nor any audio — the action card is the entire response.
          if (noSpeech) return;
          enqueue({ type: "text-delta", content: delta });
          if (useCartesiaWs && cartesiaSession) {
            cartesiaSession.pushTranscript(delta, true);
          } else if (useSarvamWs && sarvamSession) {
            sarvamSession.pushText(delta);
          } else {
            await pushFallbackTtsDelta(delta);
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
              // Only surface errors if speech was actually started — if the
              // session was cancelled before any audio was sent (e.g. the LLM
              // produced empty speech), the cancellation error is harmless.
              if (!aborted && speechStartSent) {
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
              language: speechLanguage,
              apiKey: ttsProviderApiKey ?? undefined,
            });
            audioPump = startAudioPump(cartesiaSession.consumeAudio());
          } else if (useSarvamWs) {
            sarvamSession = await SarvamTtsWebSocketSession.open({
              modelId: getSpeechApiModelId(ttsModelId) ?? "bulbul:v3",
              speaker: voice,
              language: speechLanguage,
              apiKey: ttsProviderApiKey ?? undefined,
            });
            audioPump = startAudioPump(sarvamSession.consumeAudio());
          }

          const streamCallBase = {
            systemPrompt,
            greeting,
            messages: sdkMessages,
            providerOptions,
            availableActions: enabledActions,
            endConversation: endConversationConfig,
            languageSupport: isSupportTurn && !introBrief
              ? {
                  active: true,
                  languageLabel: localeLabel(speechLanguage),
                  primaryLanguageLabel: localeLabel(language),
                }
              : undefined,
            languageHelpAvailable:
              languageHelpAvailable && supportAvail
                ? { languageLabel: localeLabel(supportAvail) }
                : undefined,
            activityType: body.activityType,
            dualTranscript: dualTranscriptDescriptor,
          };

          attemptLoop: for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt++) {
            if (aborted) break attemptLoop;

            const startedAtMs = Date.now();
            const resolvedCall = resolveMultimodalTurnCall(streamCallBase);
            const invocationId = scheduleAiInvocationStart({
              appFunctionKey: "text.chat_tutoring",
              classId: classDbId,
              assignmentId,
              submissionId: submissionId ?? null,
              questionOrder,
              attemptNumber: attemptNumber ?? null,
              model: invocationModel,
              sdkRequest: buildLoggedStreamObjectRequest({
                system: resolvedCall.system,
                messages: resolvedCall.messages,
                providerOptions: resolvedCall.providerOptions,
                schemaName: TURN_SCHEMA_NAME,
              }),
              retryOf: firstInvocationId,
              retryIndex: attempt,
            });
            if (invocationId && attempt === 0) {
              firstInvocationId = invocationId;
            }

            const result = createMultimodalTurnStream({
              model,
              ...streamCallBase,
            });
            lastStreamResult = result;
            let deliveredToClient = false;

            try {
              let lastSpeechLength = 0;

              // streamObject does not throw from the iterator on provider
              // failure — it ends and surfaces the error via `result.object`.
              for await (const partial of result.partialObjectStream) {
                if (aborted) break attemptLoop;

                // Track the growing userTranscript value across partials.
                // We do NOT emit yet — we wait until speech starts (see below),
                // which guarantees userTranscript is fully output in the JSON.
                if (dualTranscriptDescriptor && !userTranscriptEmitted) {
                  const ut = (partial as { userTranscript?: string }).userTranscript;
                  if (typeof ut === "string" && ut.length > lastPartialUserTranscript.length) {
                    lastPartialUserTranscript = ut;
                  }
                }

                if (
                  typeof partial.speech === "string" &&
                  partial.speech.length > lastSpeechLength
                ) {
                  // speech is now streaming → userTranscript is fully resolved.
                  // Emit user_transcript BEFORE pushing any speech delta.
                  if (dualTranscriptDescriptor && !userTranscriptEmitted) {
                    const chosen = lastPartialUserTranscript.trim();
                    if (chosen) {
                      userTranscriptEmitted = true;
                      enqueue({ type: "user_transcript", text: chosen });
                      try {
                        await insertChatMessage(supabase, {
                          id: latestMessageId,
                          submission_id: submissionId ?? null,
                          assignment_id: assignmentId,
                          question_order: questionOrder,
                          role: "student",
                          content: chosen,
                          attempt_number: attemptNumber ?? null,
                        });
                      } catch (dbErr) {
                        console.error(
                          "[multimodal/turn] Failed to log dual-transcript student message:",
                          dbErr,
                        );
                      }
                    }
                  }

                  const delta = partial.speech.slice(lastSpeechLength);
                  lastSpeechLength = partial.speech.length;
                  deliveredToClient = true;
                  await pushSpeechDelta(delta);
                }

                if (partial.endConversation && !endConversationReason) {
                  endConversationReason =
                    partial.endConversation === "refusal"
                      ? "refusal"
                      : "thorough";
                  deliveredToClient = true;
                  enqueue({
                    type: "end_conversation",
                    reason: endConversationReason,
                  });
                }
              }

              // Resolve + validate the final object. A malformed `action` must
              // not discard already-delivered speech, so this is only fatal
              // (eligible for retry) when nothing was streamed yet.
              let finalObject: Awaited<typeof result.object> | null = null;
              try {
                finalObject = await result.object;
              } catch (objErr) {
                if (!deliveredToClient) throw objErr;
                console.error(
                  "[multimodal/turn] Final object invalid; proceeding without action:",
                  objErr,
                );
              }

              if (finalObject) {
                // Final-object fallback for userTranscript (in case speech never
                // triggered the partial-stream path, e.g. short replies or edge cases).
                if (dualTranscriptDescriptor && !userTranscriptEmitted) {
                  const fromFinal = (finalObject as { userTranscript?: string }).userTranscript;
                  const chosen = (
                    typeof fromFinal === "string" ? fromFinal : lastPartialUserTranscript
                  ).trim();
                  if (chosen) {
                    userTranscriptEmitted = true;
                    enqueue({ type: "user_transcript", text: chosen });
                    try {
                      await insertChatMessage(supabase, {
                        id: latestMessageId,
                        submission_id: submissionId ?? null,
                        assignment_id: assignmentId,
                        question_order: questionOrder,
                        role: "student",
                        content: chosen,
                        attempt_number: attemptNumber ?? null,
                      });
                    } catch (dbErr) {
                      console.error(
                        "[multimodal/turn] Failed to log dual-transcript student message (final):",
                        dbErr,
                      );
                    }
                  }
                }

                if (
                  typeof finalObject.speech === "string" &&
                  finalObject.speech.length > lastSpeechLength
                ) {
                  const delta = finalObject.speech.slice(lastSpeechLength);
                  lastSpeechLength = finalObject.speech.length;
                  deliveredToClient = true;
                  await pushSpeechDelta(delta);
                }
                if (finalObject.endConversation && !endConversationReason) {
                  endConversationReason =
                    finalObject.endConversation === "refusal"
                      ? "refusal"
                      : "thorough";
                  enqueue({
                    type: "end_conversation",
                    reason: endConversationReason,
                  });
                }
                if (finalObject.action) {
                  resolvedAction = finalObject.action as ActionInput;
                }
                if (finalObject.requestLanguageHelp === true && !aborted) {
                  enqueue({ type: "language_help_requested" });
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

          if (dualTranscriptDescriptor && !userTranscriptEmitted) {
            // The model didn't populate userTranscript — fall back to the primary candidate.
            const fallbackText = candidates?.[0]?.text ?? "";
            console.warn(
              "[multimodal/turn] userTranscript never resolved in dual mode; falling back to primary candidate.",
            );
            if (fallbackText) {
              enqueue({ type: "user_transcript", text: fallbackText });
              try {
                await insertChatMessage(supabase, {
                  id: latestMessageId,
                  submission_id: submissionId ?? null,
                  assignment_id: assignmentId,
                  question_order: questionOrder,
                  role: "student",
                  content: fallbackText,
                  attempt_number: attemptNumber ?? null,
                });
              } catch (dbErr) {
                console.error(
                  "[multimodal/turn] Failed to log fallback dual-transcript student message:",
                  dbErr,
                );
              }
            }
          }

          // Persist the assistant message now (before TTS finalize) so any
          // action row has a chat_message_id to reference and invocation
          // logging can link to it.
          // Persist even on interruption — a partial assistant transcript is
          // still part of the session record (matches prior behavior).
          let assistantChatMessageId: string | null = null;
          if (fullReply.trim() || resolvedAction) {
            try {
              assistantChatMessageId = await insertChatMessage(supabase, {
                id: assistantMessageId,
                submission_id: submissionId ?? null,
                assignment_id: assignmentId,
                question_order: questionOrder,
                role: "assistant",
                content: fullReply.trim() || "...",
                attempt_number: attemptNumber ?? null,
                aiMetadata,
              });
            } catch (error) {
              console.error(
                "[multimodal/turn] Failed to log assistant chat message:",
                error,
              );
            }
          }

          // Dispatch the action in parallel with TTS finalize/drain.
          let pendingAction: Promise<void> | null = null;
          if (resolvedAction && assistantChatMessageId && !aborted) {
            const actionId = crypto.randomUUID();
            const actionKind = resolvedAction.kind;
            enqueue({ type: "action_start", id: actionId, kind: actionKind });

            // Resolve the action's own content-generation model (Call 2).
            // Inherits the chat model unless an admin overrode the action's
            // catalog sub-function (e.g. text.mcq_generation).
            let actionModel = model;
            let actionProviderOptions = providerOptions;
            try {
              const actionDef = getActionDefinition(actionKind);
              const actionResolved = await getCachedResolveModelConfig({
                classDbId,
                appFunctionKey: actionDef.appFunctionKey,
              });
              actionModel = getLanguageModel(actionResolved.config);
              actionProviderOptions = providerOptionsForConfig(
                actionResolved.config,
              );
              console.log("[multimodal/turn] action model", {
                kind: actionKind,
                appFunctionKey: actionDef.appFunctionKey,
                provider: actionResolved.config.provider,
                modelId: actionResolved.config.modelId,
                keySource: actionResolved.keySource,
              });
            } catch (modelErr) {
              console.error(
                "[multimodal/turn] Failed to resolve action model; using turn model:",
                modelErr,
              );
            }

            const recentMessages = messages
              .filter((m) => !m.hidden && m.content.trim())
              .slice(-6)
              .map((m) => ({ role: m.role, content: m.content }));

            pendingAction = dispatchAction({
              id: actionId,
              action: resolvedAction,
              model: actionModel,
              providerOptions: actionProviderOptions,
              enqueue,
              supabase,
              submissionId: submissionId ?? null,
              chatMessageId: assistantChatMessageId,
              languageLabel: localeLabel(language),
              ...(supportAvail ? { supportLanguageLabel: localeLabel(supportAvail) } : {}),
              recentMessages,
            }).catch((actionErr) => {
              const message =
                actionErr instanceof Error ? actionErr.message : "Action failed";
              console.error("[multimodal/turn] Action failed:", actionErr);
              if (!aborted) {
                enqueue({
                  type: "action_error",
                  id: actionId,
                  kind: actionKind,
                  error: message,
                });
              }
            });
          }

          if (!aborted) {
            // Only finalize TTS if speech was actually generated. When speech=""
            // (e.g. requestLanguageHelp with empty speech), sending a finalization
            // signal to the TTS session with no prior transcript causes an error.
            if (fullReply.trim()) {
              if (useCartesiaWs && cartesiaSession) {
                cartesiaSession.pushTranscript("", false);
                await audioPump;
              } else if (useSarvamWs && sarvamSession) {
                sarvamSession.flush();
                await audioPump;
              } else {
                await finalizeFallbackTts();
              }
            } else {
              // No speech — close WebSocket sessions cleanly without sending content.
              if (useCartesiaWs && cartesiaSession) {
                cartesiaSession.cancelContext();
              } else if (useSarvamWs && sarvamSession) {
                sarvamSession.close();
              }
              // Fallback TTS has nothing to flush; finalizeFallbackTts guards itself.
            }
          }

          if (pendingAction) await pendingAction;

          enqueue({ type: "done" });

          if (assistantChatMessageId && winningInvocationId) {
            const chatMessageId = assistantChatMessageId;
            const invId = winningInvocationId;
            const startedAt = winningStartedAtMs;
            const streamResult = lastStreamResult;

            after(async () => {
              try {
                await setChatMessageInvocationId(chatMessageId, invId);
                await linkInvocationToChatMessage(invId, chatMessageId);
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
