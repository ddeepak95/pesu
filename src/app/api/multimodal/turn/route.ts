import { after, NextRequest, NextResponse } from "next/server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";
import {
  resolveMeteredModel,
  resolveMeteredSpeech,
  resolveMultimodalTurnCall,
  runWithAiContext,
  TURN_SCHEMA_NAME,
  type AiCallContext,
  type MeteredTtsSession,
} from "@/lib/ai/gateway";
import { dispatchAction } from "@/lib/multimodal/actions/dispatcher";
import { resolveActionModel } from "@/lib/multimodal/actions/resolveActionModel";
import type { ActionInput } from "@/lib/multimodal/actions/schema";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type {
  EndConversationConfig,
  MultimodalSdkMessage,
  TranscriptResolutionMode,
} from "@/lib/multimodal/turnConfig";
import { MULTIMODAL_ERROR_CODES } from "@/lib/multimodal/errorCodes";
import { getModelEntry, modelSupportsTasks } from "@/lib/ai/catalog/helpers";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
import { insertChatMessage } from "@/lib/queries/chatMessages";
import {
  INTERACTIVE_MAX_ATTEMPTS,
  isRetryableProviderError,
  waitBeforeRetry,
} from "@/lib/ai/retry";
import { classifyAiError } from "@/lib/ai/errors";
import { logAppEvent } from "@/lib/logging/appLog";
import {
  completeAiInvocation,
  linkInvocationToChatMessage,
  scheduleAiInvocationStart,
  scheduleFailAiInvocation,
  setChatMessageInvocationId,
  usageFromAiSdkResult,
  tokenDetailsFromAiSdkResult,
} from "@/lib/ai/logging/recordInvocation";
import {
  buildLoggedSdkResponse,
  buildLoggedStreamObjectRequest,
} from "@/lib/ai/logging/serialize";
import { getCatalogEntry } from "@/lib/konvo-voice/sessionCatalog";
import {
  KonvoLocaleVoiceError,
  resolveTtsVoice,
} from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
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
   * The support language configured for this learner. When set, the model is
   * told it may reply inline in that language if the learner asks for help. TTS
   * always renders in the primary `language`/voice — there is no voice switch.
   */
  supportLanguageAvailable?: string;
  ttsModelId: string;
  availableActions?: ActionKind[];
  endConversationConfig?: EndConversationConfig;
  /**
   * When true, the turn produces no spoken speech (e.g. a silent action-only
   * turn like suggested_response). Skips opening the TTS session entirely AND
   * suppresses the reply text (the action card is the whole response).
   */
  noSpeech?: boolean;
  /**
   * How the tutor's reply is delivered this activity. Only "automatic" streams
   * live TTS; "on_demand"/"none" stream the reply *text* but skip live speech
   * synthesis (on_demand synthesizes lazily client-side on tap). Distinct from
   * `noSpeech`, which also suppresses text. See
   * dev-docs/multimodal-interaction-config-plan.md §4b.
   */
  speechMode?: "automatic" | "on_demand" | "none";
  /**
   * Client-minted id for the assistant turn's bubble. Used as the chat_messages
   * primary key for the assistant message so the bot audio links back by FK.
   */
  assistantMessageId?: string;
  /** Activity type — varies the multimodal + language-support directives. */
  activityType?: ActivityTypeKind;
  /**
   * The assignment's own resolved template definition snapshot (already
   * loaded client-side), preferred over the kind-registry for the directive
   * fields when present and valid. Null/undefined falls back to the registry.
   */
  activityDefinitionSnapshot?: unknown | null;
  /**
   * When the latest student utterance was transcribed in two languages in parallel,
   * both candidates are passed here so the model can pick the coherent one.
   * Must have exactly 2 entries; first entry corresponds to the primary language.
   */
  latestTranscriptCandidates?: TranscriptCandidate[];
  /**
   * Present when audio delivery is "direct" (dev-docs/multimodal-interaction-
   * config-plan.md §3d) — the learner's raw utterance, sent inline instead of
   * being transcribed client-side first. Mutually exclusive with
   * latestTranscriptCandidates (direct delivery subsumes dual-STT disambiguation).
   */
  latestUserAudio?: { base64: string; mimeType: string };
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

    // A support language is configured: the model may reply inline in it when
    // the learner asks for help. TTS always renders in the primary `language`.
    const supportAvail = body.supportLanguageAvailable?.trim();
    const languageHelpAvailable = !!supportAvail && supportAvail !== language;
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

    // Direct-audio-input mode: the learner's raw audio was sent inline instead
    // of being transcribed client-side. Mutually exclusive with dual-transcript
    // mode — direct audio subsumes its disambiguation job (the model hears the
    // actual audio and can identify the spoken language itself).
    const latestUserAudio = body.latestUserAudio;
    const directAudioAttached =
      !dualTranscriptDescriptor &&
      Boolean(latestUserAudio?.base64 && latestUserAudio?.mimeType);

    const transcriptResolution: TranscriptResolutionMode | undefined =
      dualTranscriptDescriptor
        ? { kind: "dual_stt", ...dualTranscriptDescriptor }
        : directAudioAttached
          ? { kind: "direct_audio" }
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
    if (!ttsEntry) {
      return NextResponse.json(
        { error: "Selected TTS model unavailable or provider not configured" },
        { status: 400 },
      );
    }

    // TTS always renders in the primary conversation language and its single
    // voice — even when the model replies in the support language (which it
    // writes in native script). No per-turn voice switching.
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    return await runWithAiContext({ userId, classId: classDbId }, async () => {
    // Metering context bound once at handle resolution (§7.1) — attemptNumber
    // is already known from the request body here (unlike /api/evaluate,
    // which learns it later), so the full context is available up front.
    const turnContext: AiCallContext = {
      classDbId,
      assignmentId,
      submissionId: submissionId ?? null,
      questionOrder,
      attemptNumber: attemptNumber ?? null,
    };
    const ttsClient = await resolveMeteredSpeech({
      kind: "tts",
      catalogEntry: ttsEntry,
      assignmentId,
      context: turnContext,
    });
    let handle;
    try {
      handle = await resolveMeteredModel({
        appFunctionKey: "text.chat_tutoring",
        context: turnContext,
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

    console.log("[multimodal/turn]", {
      provider: handle.meta.provider,
      modelId: handle.meta.modelId,
      keySource: handle.meta.keySource,
      ttsModelId,
      ttsProvider: ttsEntry.providerId,
    });

    // Request-time capability re-check (dev-docs/multimodal-interaction-config-
    // plan.md §3h). The teacher toggle is gated at authoring time, but the
    // class's bound model can change after that — so this is a hard-error
    // safety net, not a fallback. Unlike an action-model mismatch (which just
    // degrades output quality), handing this model an audio file part it
    // doesn't support would error the whole generation.
    if (directAudioAttached) {
      const chatModelEntry = getModelEntry(handle.meta.modelId);
      if (!chatModelEntry || !modelSupportsTasks(chatModelEntry, ["audio_input"])) {
        return NextResponse.json(
          {
            error:
              "This activity's AI configuration no longer supports direct audio input to the model. Please contact your administrator.",
            code: MULTIMODAL_ERROR_CODES.AUDIO_INPUT_CAPABILITY_MISMATCH,
          },
          { status: 409 },
        );
      }
    }

    const aiMetadata = {
      aiKeySource: handle.meta.keySource,
      aiProvider: handle.meta.provider,
      aiModelId: handle.meta.modelId,
    };

    // In single-transcript mode, the student message content is already known
    // (unlike dual mode, which waits for the model to resolve `userTranscript`).
    // The actual insert + client notification happens inside the stream below,
    // via `latestStudentContent` — this keeps the "insert row, then tell the
    // client it's safe to upload audio" ordering consistent across both modes.
    const latestStudentContent = (() => {
      if (transcriptResolution) return null;
      const latestMessage = messages[messages.length - 1];
      return latestMessage?.role === "student" &&
        latestMessage.content?.trim() &&
        !latestMessage.hidden
        ? latestMessage.content
        : null;
    })();

    // Build SDK messages. In dual mode, replace the last user message with the
    // both-candidates payload so the model can choose the coherent reading. In
    // direct-audio mode, replace it with an inline audio file part instead.
    const sdkMessages: MultimodalSdkMessage[] = messages.map((msg, idx) => {
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
          `Set \`userTranscript\` to the reading you chose, copied verbatim with zero edits — ` +
          `do not fix, correct, normalize, or otherwise alter it in any way, even if it looks like ` +
          `an obvious mistake. Then reply to it.]\n` +
          `- As ${primaryLabel}: ${primaryText}\n` +
          `- As ${supportLabel}: ${supportText}`;
        return { role: "user" as const, content: dualContent };
      }

      const isDirectAudioUserMessage =
        isLast && msg.role === "student" && directAudioAttached && latestUserAudio;

      if (isDirectAudioUserMessage) {
        return {
          role: "user" as const,
          content: [
            {
              type: "file" as const,
              data: latestUserAudio.base64,
              mediaType: latestUserAudio.mimeType,
            },
          ],
        };
      }

      return {
        role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      };
    });

    const noSpeech = body.noSpeech === true;
    // Live TTS is skipped for silent action turns (noSpeech, also suppresses
    // text) AND for non-automatic speech modes (text still streams; audio is
    // either never produced or synthesized on demand). See plan §4b.
    const suppressAutoTts =
      noSpeech || (body.speechMode ? body.speechMode !== "automatic" : false);
    const useStreamingWs =
      !suppressAutoTts &&
      (ttsEntry.providerId === "cartesia" || ttsEntry.providerId === "sarvam");
    const { mimeType, sampleRate } = ttsClient.streamFormat;
    const abortSignal = request.signal;
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEvent(data)));
        };

        // Single-transcript mode: insert the student message first, then tell
        // the client it's safe to upload the utterance audio (which links to
        // this row by FK). Must happen before any other event so the client's
        // audio upload never races ahead of this insert.
        if (latestStudentContent) {
          try {
            await insertChatMessage(supabase, {
              id: latestMessageId,
              submission_id: submissionId ?? null,
              assignment_id: assignmentId,
              question_order: questionOrder,
              role: "student",
              content: latestStudentContent,
              attempt_number: attemptNumber ?? null,
            });
          } catch (error) {
            console.error("[multimodal/turn] Failed to log student chat message:", error);
          }
          enqueue({ type: "user_transcript", text: latestStudentContent });
        }

        let fullReply = "";
        let endConversationTriggered = false;
        let resolvedAction: ActionInput | null = null;
        let firstInvocationId: string | null = null;
        // Dual-transcript tracking: emit `user_transcript` SSE once the model resolves it.
        // We track the last-seen partial value and flush it the moment speech starts
        // streaming — at that point the JSON parser has moved past `userTranscript`,
        // meaning the field is complete.
        let userTranscriptEmitted = false;
        let lastPartialUserTranscript = "";
        // Direct-audio mode only: true once the model resolved an empty
        // userTranscript (silence) — the rest of the turn (speech, TTS,
        // assistant persistence) is skipped entirely for that case.
        let silenceDetected = false;
        let winningInvocationId: string | null = null;
        let winningStartedAtMs: number | undefined;
        let lastStreamResult: ReturnType<typeof handle.streamTurn> | null = null;
        let ttsSession: MeteredTtsSession | null = null;
        let speechStartSent = false;
        let pendingFallbackTts = "";
        let audioPump: Promise<void> | null = null;
        let aborted = false;

        const onAbort = () => {
          aborted = true;
          void ttsSession?.close().catch(() => {});
        };
        abortSignal.addEventListener("abort", onAbort);

        const ensureSpeechStart = () => {
          if (speechStartSent) return;
          speechStartSent = true;
          const wsFormat = ttsSession?.streamFormat;
          enqueue({
            type: "speech_start",
            index: 0,
            mimeType: useStreamingWs ? wsFormat?.mimeType ?? mimeType : mimeType,
            sampleRate: useStreamingWs ? wsFormat?.sampleRate ?? sampleRate : sampleRate,
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
            continueGeneration,
          };

          if (ttsClient.synthesizeStream) {
            for await (const chunk of ttsClient.synthesizeStream(synthInput)) {
              if (aborted) return;
              enqueueSpeechChunk(chunk);
            }
          } else {
            const result = await ttsClient.synthesize(synthInput);
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
          if (suppressAutoTts) return;
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
          // Non-automatic speech modes stream text but no live audio.
          if (suppressAutoTts) return;
          if (useStreamingWs && ttsSession) {
            ttsSession.pushText(delta, { continueGeneration: true });
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
          if (useStreamingWs) {
            ttsSession = await ttsClient.openSynthesisSession({ voice, language });
            audioPump = startAudioPump(ttsSession.consumeAudio());
          }

          const streamCallBase = {
            systemPrompt,
            greeting,
            messages: sdkMessages,
            availableActions: enabledActions,
            endConversation: endConversationConfig,
            languageHelpAvailable:
              languageHelpAvailable && supportAvail
                ? { languageLabel: localeLabel(supportAvail) }
                : undefined,
            primaryLanguageLabel: localeLabel(language),
            activityType: body.activityType,
            activityDefinitionSnapshot: body.activityDefinitionSnapshot,
            transcriptResolution,
          };

          // Cap each silent-retry backoff so a long Retry-After can't hold the
          // SSE stream open in dead air — beyond 2 quick attempts the student
          // controls the retry via the failed-turn bubble. See plan §4.
          const INTERACTIVE_RETRY_DELAY_CAP_MS = 4000;
          attemptLoop: for (let attempt = 0; attempt < INTERACTIVE_MAX_ATTEMPTS; attempt++) {
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
              model: handle.meta,
              sdkRequest: buildLoggedStreamObjectRequest({
                system: resolvedCall.system,
                // Audio parts aren't loggable text — and shouldn't be persisted
                // into the invocation log anyway (bloats storage, and it's the
                // learner's recorded voice). Redact to a short placeholder.
                messages: resolvedCall.messages.map((m) => ({
                  role: m.role,
                  content:
                    typeof m.content === "string" ? m.content : "[audio attached]",
                })),
                providerOptions: resolvedCall.providerOptions,
                schemaName: TURN_SCHEMA_NAME,
              }),
              retryOf: firstInvocationId,
              retryIndex: attempt,
            });
            if (invocationId && attempt === 0) {
              firstInvocationId = invocationId;
            }

            const result = handle.streamTurn(streamCallBase);
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
                if (transcriptResolution && !userTranscriptEmitted) {
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
                  if (transcriptResolution && !userTranscriptEmitted) {
                    const chosen = lastPartialUserTranscript.trim();
                    if (chosen) {
                      userTranscriptEmitted = true;
                      // Insert BEFORE notifying the client — the client reacts to
                      // this event by immediately posting the utterance audio with
                      // this chat_message_id, which would race the insert below and
                      // violate the FK constraint if the event went out first.
                      try {
                        await insertChatMessage(supabase, {
                          id: latestMessageId,
                          submission_id: submissionId ?? null,
                          assignment_id: assignmentId,
                          question_order: questionOrder,
                          role: "student",
                          content: chosen,
                          attempt_number: attemptNumber ?? null,
                          transcriptCandidates: candidates?.slice(0, 2),
                        });
                      } catch (dbErr) {
                        console.error(
                          "[multimodal/turn] Failed to log transcript-resolution student message:",
                          dbErr,
                        );
                      }
                      enqueue({ type: "user_transcript", text: chosen });
                    } else if (transcriptResolution.kind === "direct_audio") {
                      // Silence is itself a valid, final resolution for direct
                      // audio input — there's no STT candidate to fall back to
                      // (unlike dual_stt, where an empty pick here is treated as
                      // "not yet resolved" and the post-loop fallback below
                      // reuses the primary candidate instead). Skip the rest of
                      // the turn entirely — no speech has been pushed yet.
                      userTranscriptEmitted = true;
                      silenceDetected = true;
                      enqueue({ type: "user_transcript_empty" });
                      break attemptLoop;
                    }
                  }

                  const delta = partial.speech.slice(lastSpeechLength);
                  lastSpeechLength = partial.speech.length;
                  deliveredToClient = true;
                  await pushSpeechDelta(delta);
                }

                if (partial.endConversation && !endConversationTriggered) {
                  endConversationTriggered = true;
                  deliveredToClient = true;
                  enqueue({ type: "end_conversation" });
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
                if (transcriptResolution && !userTranscriptEmitted) {
                  const fromFinal = (finalObject as { userTranscript?: string }).userTranscript;
                  const chosen = (
                    typeof fromFinal === "string" ? fromFinal : lastPartialUserTranscript
                  ).trim();
                  if (chosen) {
                    userTranscriptEmitted = true;
                    try {
                      await insertChatMessage(supabase, {
                        id: latestMessageId,
                        submission_id: submissionId ?? null,
                        assignment_id: assignmentId,
                        question_order: questionOrder,
                        role: "student",
                        content: chosen,
                        attempt_number: attemptNumber ?? null,
                        transcriptCandidates: candidates?.slice(0, 2),
                      });
                    } catch (dbErr) {
                      console.error(
                        "[multimodal/turn] Failed to log transcript-resolution student message (final):",
                        dbErr,
                      );
                    }
                    enqueue({ type: "user_transcript", text: chosen });
                  } else if (transcriptResolution.kind === "direct_audio") {
                    userTranscriptEmitted = true;
                    silenceDetected = true;
                    enqueue({ type: "user_transcript_empty" });
                  }
                }

                if (
                  !silenceDetected &&
                  typeof finalObject.speech === "string" &&
                  finalObject.speech.length > lastSpeechLength
                ) {
                  const delta = finalObject.speech.slice(lastSpeechLength);
                  lastSpeechLength = finalObject.speech.length;
                  deliveredToClient = true;
                  await pushSpeechDelta(delta);
                }
                if (!silenceDetected && finalObject.endConversation && !endConversationTriggered) {
                  endConversationTriggered = true;
                  enqueue({ type: "end_conversation" });
                }
                if (!silenceDetected && finalObject.action) {
                  resolvedAction = finalObject.action as ActionInput;
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
                attempt < INTERACTIVE_MAX_ATTEMPTS - 1
              ) {
                if (invocationId) {
                  scheduleFailAiInvocation(invocationId, err, startedAtMs);
                }
                // Tell the client we're reconnecting so BotStatusPanel can show
                // "Reconnecting…" instead of silent dead air during the backoff.
                enqueue({ type: "retrying", attempt: attempt + 1 });
                logAppEvent({
                  level: "warn",
                  source: "multimodal_turn",
                  event: "silent_retry",
                  errorCode: classifyAiError(err).code,
                  message: err instanceof Error ? err.message : undefined,
                  classId: classDbId,
                  activityId: assignmentId,
                  submissionId: submissionId ?? null,
                  questionOrder,
                  aiInvocationId: invocationId,
                  metadata: { attempt: attempt + 1 },
                });
                await waitBeforeRetry(
                  err,
                  attempt,
                  INTERACTIVE_RETRY_DELAY_CAP_MS,
                );
                continue attemptLoop;
              }
              if (invocationId) {
                scheduleFailAiInvocation(invocationId, err, startedAtMs);
              }
              if (!deliveredToClient) {
                const classified = classifyAiError(err);
                logAppEvent({
                  level: "error",
                  source: "multimodal_turn",
                  event: "ai_failure",
                  errorCode: classified.code,
                  message: classified.message,
                  classId: classDbId,
                  activityId: assignmentId,
                  submissionId: submissionId ?? null,
                  questionOrder,
                  aiInvocationId: invocationId ?? firstInvocationId,
                });
                enqueue({
                  type: "error",
                  error: classified.message,
                  code: classified.code,
                  retryable: classified.retryable,
                  ...(classified.retryAfterMs
                    ? { retryAfterMs: classified.retryAfterMs }
                    : {}),
                });
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
              try {
                await insertChatMessage(supabase, {
                  id: latestMessageId,
                  submission_id: submissionId ?? null,
                  assignment_id: assignmentId,
                  question_order: questionOrder,
                  role: "student",
                  content: fallbackText,
                  attempt_number: attemptNumber ?? null,
                  transcriptCandidates: candidates?.slice(0, 2),
                });
              } catch (dbErr) {
                console.error(
                  "[multimodal/turn] Failed to log fallback dual-transcript student message:",
                  dbErr,
                );
              }
              enqueue({ type: "user_transcript", text: fallbackText });
            }
          } else if (transcriptResolution?.kind === "direct_audio" && !userTranscriptEmitted) {
            // The model never produced a userTranscript at all (e.g. the whole
            // generation errored before yielding anything) — there's no STT
            // candidate to fall back to, so treat it the same as silence rather
            // than leaving the client's pending bubble stuck indefinitely.
            console.warn(
              "[multimodal/turn] userTranscript never resolved in direct-audio mode; treating as silence.",
            );
            silenceDetected = true;
            enqueue({ type: "user_transcript_empty" });
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
            // The action_start event carries the action's generation `input` so
            // the client can retry generation (via /api/multimodal/action-retry)
            // without a turn re-run if it fails. The payload is tiny.
            enqueue({
              type: "action_start",
              id: actionId,
              kind: actionKind,
              input: resolvedAction,
              chatMessageId: assistantChatMessageId,
            });

            // Resolve the action's own content-generation model (Call 2).
            // Inherits the chat handle unless an admin overrode the action's
            // catalog sub-function (e.g. text.mcq_generation). relatedEntity
            // links every attempt of this action to the same actionId (§5.3).
            const actionHandle = await resolveActionModel({
              context: {
                classDbId,
                assignmentId,
                submissionId: submissionId ?? null,
                questionOrder,
                attemptNumber: attemptNumber ?? null,
                relatedEntity: { type: "chat_message_action", id: actionId },
              },
              kind: actionKind,
              fallback: handle,
            });

            const recentMessages = messages
              .filter((m) => !m.hidden && m.content.trim())
              .slice(-6)
              .map((m) => ({ role: m.role, content: m.content }));

            pendingAction = dispatchAction({
              id: actionId,
              action: resolvedAction,
              handle: actionHandle,
              enqueue,
              supabase,
              submissionId: submissionId ?? null,
              chatMessageId: assistantChatMessageId,
              languageLabel: localeLabel(language),
              ...(supportAvail ? { supportLanguageLabel: localeLabel(supportAvail) } : {}),
              recentMessages,
              classId: classDbId,
              assignmentId,
              questionOrder,
            }).catch((actionErr) => {
              // dispatchAction has already logged the terminal failure (app_logs)
              // and exhausted silent retries. Keep the card in an error state on
              // the client (with the classification) instead of dropping it.
              const classified = classifyAiError(actionErr);
              console.error("[multimodal/turn] Action failed:", actionErr);
              if (!aborted) {
                enqueue({
                  type: "action_error",
                  id: actionId,
                  kind: actionKind,
                  error: classified.message,
                  code: classified.code,
                  retryable: classified.retryable,
                  ...(classified.retryAfterMs
                    ? { retryAfterMs: classified.retryAfterMs }
                    : {}),
                });
              }
            });
          }

          if (!aborted) {
            // Only finalize TTS if speech was actually generated. When speech=""
            // (e.g. a no-speech turn), sending a finalization signal to the TTS
            // session with no prior transcript causes an error.
            if (fullReply.trim()) {
              if (useStreamingWs && ttsSession) {
                ttsSession.pushText("", { continueGeneration: false });
                await audioPump;
              } else {
                await finalizeFallbackTts();
              }
            } else {
              // No speech — close the session cleanly without sending content.
              if (useStreamingWs && ttsSession) {
                await ttsSession.close();
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
                const tokenDetails = streamResult
                  ? await tokenDetailsFromAiSdkResult(streamResult)
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
                      endConversationTriggered,
                    },
                    usage,
                    tokenDetails,
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
          const classified = classifyAiError(error);
          logAppEvent({
            level: "error",
            source: "multimodal_turn",
            event: "ai_failure",
            errorCode: classified.code,
            message: classified.message,
            classId: classDbId,
            activityId: assignmentId,
            submissionId: submissionId ?? null,
            questionOrder,
            aiInvocationId: firstInvocationId,
          });
          enqueue({
            type: "error",
            error: classified.message,
            code: classified.code,
            retryable: classified.retryable,
            ...(classified.retryAfterMs
              ? { retryAfterMs: classified.retryAfterMs }
              : {}),
          });
          enqueue({ type: "done" });
        } finally {
          abortSignal.removeEventListener("abort", onAbort);
          void ttsSession?.close().catch(() => {});
          controller.close();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders() });
    });
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
