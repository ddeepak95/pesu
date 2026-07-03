"use client";

import React from "react";
import { Lightbulb, Loader2, Play } from "lucide-react";
import type { TransliterationResult } from "@/lib/ai/schemas/transliteration";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useMultimodalSpeechModels } from "@/hooks/swr/useMultimodalSpeechModels";
import { Button } from "@/components/ui/button";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
import { showErrorToast, showWarningToast } from "@/lib/toast";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";
import { DEFAULT_KONVO_SESSION_CONFIG } from "@/components/Shared/KonvoVoice/defaultSessionConfig";
import { useAudioRecorder } from "@/components/Shared/KonvoVoice/useAudioRecorder";
import { useStreamingSpeechPlayback } from "@/components/Shared/KonvoVoice/useStreamingSpeechPlayback";
import {
  audioBufferSliceToWavBlob,
  pcmToWavArrayBuffer,
} from "@/lib/konvo-voice/speech/audioBufferToWav";
import { ContentBox } from "@/components/Shared/KonvoVoice/ContentBox";
import { BotStatusPanel } from "@/components/Shared/KonvoVoice/BotStatusPanel";
import { UserInputPanel } from "@/components/Shared/KonvoVoice/UserInputPanel";
import { APP_ASSESSMENT_SHELL_CLASS } from "@/components/Shared/KonvoVoice/layoutConstants";
import { getKonvoUiConfig } from "@/components/Shared/KonvoVoice/uiState";
import type { PendingAction } from "@/components/Shared/KonvoVoice/actionTypes";
import type {
  ActionKind,
  ActionPayload,
} from "@/lib/multimodal/actions/types";
import {
  type ActionDefinition,
  resolveAutoActions,
  resolveBulbAction,
} from "@/lib/multimodal/actions/registry";
import { useEndConversationFinish } from "./useEndConversationFinish";
import type { AssessmentInputProps } from "./types";
import { INTEGRITY_ACCESS_REVOKED_ERROR_CODE } from "@/lib/integrity/constants";
import { AI_NOT_CONFIGURED_ERROR_CODE } from "@/lib/ai/credentials/constants";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "student" | "assistant";
  content: string;
  status?: "transcribing";
  /** True while the assistant bubble is still streaming text in this turn. */
  streaming?: boolean;
  /** Set on a standalone action-only message (empty content). */
  action?: PendingAction;
  /** Hidden context sent to the LLM but not rendered (e.g. MCQ result note). */
  hidden?: boolean;
  /**
   * Both transcript candidates when dual-language transcription was used.
   * Present only on the latest student message while the LLM is resolving
   * which reading is correct. Cleared once `user_transcript` arrives.
   */
  transcriptCandidates?: { language: string; text: string }[];
}

type ChatPhase =
  | "not_started"
  | "bot_thinking"
  | "bot_speaking"
  | "user_idle"
  | "user_recording"
  | "user_submitting";

type MultimodalTurnEvent =
  | { type: "text-delta"; content: string }
  | { type: "end_conversation" }
  | { type: "speech_start"; index?: number; sampleRate?: number }
  | { type: "speech_chunk"; index?: number; base64: string }
  | { type: "speech_end"; index?: number }
  | { type: "action_start"; id: string; kind: ActionKind }
  | { type: "action_payload"; id: string; kind: ActionKind; data: ActionPayload }
  | { type: "action_error"; id: string; kind: ActionKind; error?: string }
  | { type: "user_transcript"; text: string }
  | { type: "done" }
  | { type: "error"; error?: string; message?: string };

function formatFullStudentTranscript(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.hidden) continue;
    if (m.role === "student" && m.content.trim()) {
      parts.push(m.content.trim());
      continue;
    }
    // Answered MCQs are part of the learner's contribution — include the
    // question, their selection, and whether it was correct for the evaluator.
    const action = m.action;
    if (
      action?.payload?.kind === "mcq" &&
      action.answeredIndex !== undefined
    ) {
      const mcq = action.payload;
      const selected = mcq.choices[action.answeredIndex] ?? "";
      const correct = action.answeredIndex === mcq.correctIndex;
      const correctText = mcq.choices[mcq.correctIndex] ?? "";
      parts.push(
        `[Multiple choice question] ${mcq.question}\n` +
          `Selected: ${selected} (${correct ? "correct" : "incorrect"})` +
          (correct ? "" : `\nCorrect answer: ${correctText}`),
      );
    }
  }
  return parts.join("\n\n");
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function* parseMultimodalTurnStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<MultimodalTurnEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.trim().split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6);
        try {
          const parsed = JSON.parse(jsonStr) as MultimodalTurnEvent;
          yield parsed;
        } catch {
          // ignore malformed SSE chunk
        }
      }
    }
  }
}

async function tryConvertToWavBlob(blob: Blob): Promise<Blob> {
  const mime = blob.type.toLowerCase();
  if (mime.includes("wav")) return blob;
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return audioBufferSliceToWavBlob(decoded, 0, decoded.length);
  } finally {
    void ctx.close();
  }
}

export function MultimodalInputArea({
  question,
  language,
  assignmentId,
  submissionId,
  maxAttemptsReached,
  attempts,
  nextAttemptNumber,
  isEvaluating,
  onSubmitForEvaluation,
  onLanguageDisabledChange,
  onNavigationDisabledChange,
  onVoiceMicPermissionRequestPendingChange,
  onIntegrityAccessRevoked,
  fileSubmissionsContent,
  activityType = "learning",
  activityDefinitionSnapshot,
  title,
  studentInstructions,
  maxAttempts,
  sharedContext,
  botPromptConfig,
  supportLanguage,
}: AssessmentInputProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [expandedMessageIds, setExpandedMessageIds] = React.useState<
    Record<string, boolean>
  >({});
  const [transliterations, setTransliterations] = React.useState<Record<string, TransliterationResult>>({});
  const [transliterationPending, setTransliterationPending] = React.useState<Record<string, boolean>>({});
  const messageAudioUrlsRef = React.useRef<Map<string, string>>(new Map());
  const [messageAudioAvailableIds, setMessageAudioAvailableIds] = React.useState<Set<string>>(new Set());
  const replayAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = React.useState<string | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [isAssistantTurnActive, setIsAssistantTurnActive] =
    React.useState(false);
  const [isThinking, setIsThinking] = React.useState(false);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [micRequestPending, setMicRequestPending] = React.useState(false);
  const [sessionChunkIndex, setSessionChunkIndex] = React.useState(0);

  const { systemPrompt, greeting } = useInterpolatedPrompts({
    question,
    language,
    attemptCount: attempts.length,
    activityType,
    title,
    studentInstructions,
    maxAttempts,
    sharedContext,
    botPromptConfig,
    fileSubmissionsContent,
    assessmentMode: "multimodal",
    supportLanguage,
  });

  const { data: speechModels } = useMultimodalSpeechModels(assignmentId);

  // Language support: an additional language the tutor can re-explain in. The
  // active language is chosen in the shell (alongside the main language) and
  // passed in as `supportLanguage`.
  const supportEnabled =
    (botPromptConfig?.multimodal_actions?.languageSupport?.enabled ?? false) &&
    Boolean(supportLanguage) &&
    supportLanguage !== language;

  const transliterationEnabled = supportEnabled;

  const recorder = useAudioRecorder();
  const playback = useStreamingSpeechPlayback();
  const { state: micPermission, requestAccess } = useMicrophonePermission();
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const userOrdinalRef = React.useRef(0);
  const botOrdinalRef = React.useRef(0);
  // In dual-transcript mode, the WAV blob is stored here keyed by pending message
  // id so we can persist audio after `user_transcript` arrives from the server.
  const deferredStudentAudioRef = React.useRef<Map<string, Blob>>(new Map());
  const botInterruptionRequestedRef = React.useRef(false);
  const assistantTurnSeqRef = React.useRef(0);
  const activeAbortRef = React.useRef<AbortController | null>(null);
  const activeAssistantTurnRef = React.useRef<{
    text: string;
    ttsStarted: boolean;
    committed: boolean;
  }>({
    text: "",
    ttsStarted: false,
    committed: false,
  });
  const sessionStartedAtRef = React.useRef<string | null>(null);
  const botUserCardsRef = React.useRef<HTMLDivElement>(null);
  const playbackResetRef = React.useRef(playback.reset);

  playbackResetRef.current = playback.reset;

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    setExpandedMessageIds((prev) => {
      let next: Record<string, boolean> | null = null;
      for (const m of messages) {
        if (prev[m.id] !== undefined) continue;
        if (!next) next = { ...prev };
        next[m.id] = false;
      }
      return next ?? prev;
    });
  }, [messages]);

  React.useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
      playbackResetRef.current();
    };
  }, []);

  const hasStarted = messages.length > 0 || isStarting;

  const phase: ChatPhase = React.useMemo(() => {
    if (!hasStarted && !isStarting) return "not_started";
    if (isTranscribing) return "user_submitting";
    if (isAssistantTurnActive || isThinking || isStarting) {
      return isSpeaking ? "bot_speaking" : "bot_thinking";
    }
    if (isSpeaking) return "bot_speaking";
    if (recorder.isRecording) return "user_recording";
    return "user_idle";
  }, [
    hasStarted,
    isTranscribing,
    isAssistantTurnActive,
    isThinking,
    isStarting,
    isSpeaking,
    recorder.isRecording,
  ]);

  const ui = React.useMemo(
    () => getKonvoUiConfig(phase, isTranscribing),
    [phase, isTranscribing],
  );

  React.useEffect(() => {
    onLanguageDisabledChange?.(hasStarted);
  }, [hasStarted, onLanguageDisabledChange]);

  React.useEffect(() => {
    onVoiceMicPermissionRequestPendingChange?.(micRequestPending);
    return () => onVoiceMicPermissionRequestPendingChange?.(false);
  }, [micRequestPending, onVoiceMicPermissionRequestPendingChange]);

  React.useEffect(() => {
    const disableNavigation =
      recorder.isRecording ||
      isStarting ||
      isTranscribing ||
      isThinking ||
      isSpeaking ||
      micRequestPending ||
      isEvaluating;
    onNavigationDisabledChange?.(disableNavigation);
    return () => onNavigationDisabledChange?.(false);
  }, [
    recorder.isRecording,
    isStarting,
    isTranscribing,
    isThinking,
    isSpeaking,
    micRequestPending,
    isEvaluating,
    onNavigationDisabledChange,
  ]);

  const flushSessionChunk = React.useCallback(
    async (wavBlob: Blob) => {
      const formData = new FormData();
      formData.append("submissionId", submissionId);
      formData.append("assignmentId", assignmentId);
      formData.append("questionOrder", String(question.order));
      formData.append("attemptNumber", String(nextAttemptNumber));
      formData.append("chunkIndex", String(sessionChunkIndex + 1));
      if (sessionChunkIndex === 0 && sessionStartedAtRef.current) {
        formData.append("recordingStartedAt", sessionStartedAtRef.current);
      }
      formData.append(
        "audio",
        new File([wavBlob], "session.wav", { type: "audio/wav" }),
      );
      void fetch("/api/multimodal/audio/session-chunk", {
        method: "POST",
        body: formData,
      }).catch((chunkError) => {
        console.error("Failed to persist session chunk", chunkError);
      });
      setSessionChunkIndex((v) => v + 1);
    },
    [
      assignmentId,
      nextAttemptNumber,
      question.order,
      sessionChunkIndex,
      submissionId,
    ],
  );

  const persistUtteranceAudio = React.useCallback(
    async (input: {
      dbRole: "student" | "assistant";
      storageRole: "user" | "bot";
      ordinal: number;
      audioBlob: Blob;
      content: string;
      generatedContent?: string;
      interrupted?: boolean;
      /**
       * The chat_messages id this utterance belongs to (the client-minted bubble
       * id, which the turn route uses as the chat_messages primary key). Links the
       * audio to its transcript turn by FK.
       */
      chatMessageId?: string;
    }) => {
      try {
        const formData = new FormData();
        formData.append("submissionId", submissionId);
        formData.append("assignmentId", assignmentId);
        formData.append("questionOrder", String(question.order));
        formData.append("attemptNumber", String(nextAttemptNumber));
        formData.append("utteranceOrdinal", String(input.ordinal));
        formData.append("dbRole", input.dbRole);
        formData.append("storageRole", input.storageRole);
        formData.append("interrupted", String(Boolean(input.interrupted)));
        formData.append("spokenAt", new Date().toISOString());
        formData.append("content", input.content);
        if (input.generatedContent) {
          formData.append("generatedContent", input.generatedContent);
        }
        if (input.chatMessageId) {
          formData.append("chatMessageId", input.chatMessageId);
        }
        formData.append(
          "audio",
          new File(
            [input.audioBlob],
            `${input.storageRole}-${input.ordinal}.wav`,
            {
              type: "audio/wav",
            },
          ),
        );
        const res = await fetch("/api/multimodal/audio/utterance", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json().catch(() => ({}))) as { audioFileUrl?: string };
        await flushSessionChunk(input.audioBlob);
        return { audioFileUrl: data.audioFileUrl ?? "" };
      } catch (utteranceError) {
        console.error("Failed to persist utterance audio", utteranceError);
        return null;
      }
    },
    [
      assignmentId,
      nextAttemptNumber,
      flushSessionChunk,
      question.order,
      submissionId,
    ],
  );

  const finishSubmission = React.useCallback(async () => {
    const answerText = formatFullStudentTranscript(messagesRef.current).trim();
    await onSubmitForEvaluation(answerText);
  }, [onSubmitForEvaluation]);

  // Live streaming bubble: the assistant message is appended as soon as text
  // starts arriving and updated in place as more streams in. `commit` then just
  // finalizes it (clears the streaming flag).
  const liveAssistantMessageIdRef = React.useRef<string | null>(null);

  const upsertLiveAssistantMessage = React.useCallback(
    (text: string, options?: { turnId?: number }) => {
      if (
        options?.turnId !== undefined &&
        options.turnId !== assistantTurnSeqRef.current
      ) {
        return;
      }
      // Once the turn is finalized, ignore any trailing deltas (e.g. buffered
      // events after an interruption) so they can't spawn a second bubble.
      if (activeAssistantTurnRef.current.committed) return;

      // Resolve the live message id OUTSIDE the state updater so it is stable
      // (the updater must stay pure — no id minting / ref writes inside it).
      let liveId = liveAssistantMessageIdRef.current;
      if (!liveId) {
        liveId = crypto.randomUUID();
        liveAssistantMessageIdRef.current = liveId;
      }
      const id = liveId;
      setMessages((prev) => {
        const next = prev.some((m) => m.id === id)
          ? prev.map((m) =>
              m.id === id
                ? { ...m, content: text || "...", streaming: true }
                : m,
            )
          : [
              ...prev,
              {
                id,
                role: "assistant" as const,
                content: text || "...",
                streaming: true,
              },
            ];
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const commitAssistantTurnToMessages = React.useCallback(
    (options?: { force?: boolean; turnId?: number }) => {
      if (
        options?.turnId !== undefined &&
        options.turnId !== assistantTurnSeqRef.current
      ) {
        return false;
      }
      const turn = activeAssistantTurnRef.current;
      if (turn.committed) return false;
      const content = turn.text.trim();
      if (!options?.force && !content && !turn.ttsStarted) return false;
      turn.committed = true;
      const liveId = liveAssistantMessageIdRef.current;
      liveAssistantMessageIdRef.current = null;
      setMessages((prev) => {
        // Finalize the live streaming bubble if it exists; otherwise append one
        // (e.g. interrupted before any text streamed).
        if (liveId && prev.some((m) => m.id === liveId)) {
          const next = prev.map((m) =>
            m.id === liveId
              ? { ...m, content: content || "...", streaming: false }
              : m,
          );
          messagesRef.current = next;
          return next;
        }
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: content || "...",
        };
        const next = [...prev, assistantMessage];
        messagesRef.current = next;
        return next;
      });
      return true;
    },
    [],
  );

  const { scheduleAutoFinish, runFinish: handleFinishAndEvaluate } =
    useEndConversationFinish({
      isEvaluating,
      maxAttemptsReached,
      hasStudentContent: () =>
        messagesRef.current.some(
          (m) =>
            (m.role === "student" &&
              !m.hidden &&
              (m.content?.trim() ?? "") !== "") ||
            (m.action?.payload?.kind === "mcq" &&
              m.action.answeredIndex !== undefined),
        ),
      onWarnNoStudentContent: () => {
        showWarningToast(
          "Please provide at least one response before finishing.",
        );
      },
      onWarnMaxAttemptsReached: () => {
        showWarningToast(
          "You have reached the maximum number of attempts for this question.",
        );
      },
      onFinish: finishSubmission,
    });

  const releaseAssistantTurnUi = React.useCallback(
    (turnId: number) => {
      if (assistantTurnSeqRef.current !== turnId) return;
      setIsAssistantTurnActive(false);
      setIsThinking(false);
      setIsSpeaking(false);
      setIsStarting(false);
      playback.releasePlayback();
    },
    [playback],
  );

  const runAssistantTurn = React.useCallback(
    async (
      history: ChatMessage[],
      opts?: { availableActionsOverride?: ActionKind[]; noSpeech?: boolean },
    ) => {
      const turnId = ++assistantTurnSeqRef.current;
      setIsAssistantTurnActive(true);
      setIsThinking(true);
      setIsSpeaking(false);
      setError(null);
      botInterruptionRequestedRef.current = false;

      const ttsModelId =
        speechModels?.ttsModelId ?? DEFAULT_KONVO_SESSION_CONFIG.ttsModelId;
      const attemptNumber = nextAttemptNumber;

      let sampleRate = 24000;
      let ttsStarted = false;
      let interrupted = false;
      const pcmChunks: Uint8Array[] = [];
      let speechSegmentPrepared = false;
      let speechSegmentEnded = false;
      let assistantText = "";
      let didEndConversation = false;

      replayAudioRef.current?.pause();
      replayAudioRef.current = null;
      setPlayingMessageId(null);
      playback.beginTurn({
        onPlaybackStart: () => {
          if (assistantTurnSeqRef.current !== turnId) return;
          activeAssistantTurnRef.current.ttsStarted = true;
          setIsSpeaking(true);
        },
      });

      const controller = new AbortController();
      activeAbortRef.current = controller;
      activeAssistantTurnRef.current = {
        text: "",
        ttsStarted: false,
        committed: false,
      };
      // Mint the assistant bubble id up front so it can be sent to the turn route
      // as the chat_messages primary key — that lets the bot audio
      // (voice_messages.chat_message_id) link back to the transcript turn by FK.
      // It doubles as the live streaming bubble id.
      const assistantMessageId = crypto.randomUUID();
      liveAssistantMessageIdRef.current = assistantMessageId;

      // If the latest history message has dual candidates, pass them to the turn
      // route so the LLM can pick the coherent reading.
      const latestMsg = history[history.length - 1];
      const latestTranscriptCandidates =
        latestMsg?.role === "student" && latestMsg.transcriptCandidates?.length
          ? latestMsg.transcriptCandidates
          : undefined;

      try {
        const response = await fetch("/api/multimodal/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityType,
            assignmentId,
            submissionId,
            questionOrder: question.order,
            attemptNumber,
            messages: history
              .filter((m) => m.content.trim().length > 0)
              .map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                ...(m.hidden ? { hidden: true } : {}),
              })),
            assistantMessageId,
            system_prompt: systemPrompt,
            greeting,
            language,
            ttsModelId,
            ...(supportEnabled && supportLanguage
              ? { supportLanguageAvailable: supportLanguage }
              : {}),
            ...(latestTranscriptCandidates
              ? { latestTranscriptCandidates }
              : {}),
            availableActions: (() => {
              if (opts?.availableActionsOverride) return opts.availableActionsOverride;
              const auto = resolveAutoActions(activityDefinitionSnapshot, activityType);
              const configured = botPromptConfig?.multimodal_actions?.availableActions ?? [];
              return [...auto, ...configured.filter((k) => !auto.includes(k))];
            })(),
            endConversationConfig:
              botPromptConfig?.multimodal_actions?.endConversation,
            ...(opts?.noSpeech ? { noSpeech: true } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          if (
            response.status === 403 &&
            errorData.code === INTEGRITY_ACCESS_REVOKED_ERROR_CODE
          ) {
            onIntegrityAccessRevoked?.();
          }
          if (
            response.status === 503 &&
            errorData.code === AI_NOT_CONFIGURED_ERROR_CODE
          ) {
            throw new Error(
              errorData.error ||
                "AI capabilities are disabled for this class. Please contact your instructor.",
            );
          }
          throw new Error(errorData.error || "Failed to stream assistant turn");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        for await (const event of parseMultimodalTurnStream(reader)) {
          if (event.type === "text-delta") {
            assistantText += event.content;
            activeAssistantTurnRef.current.text = assistantText;
            // Stream the text live into the bot's bubble as it arrives.
            upsertLiveAssistantMessage(assistantText, { turnId });
          } else if (event.type === "end_conversation") {
            didEndConversation = true;
          } else if (event.type === "action_start") {
            // The action is its own message. Ensure the (live) speech bubble
            // exists first so it precedes the card; it keeps streaming while the
            // loading card appears below.
            if (assistantText.trim()) {
              upsertLiveAssistantMessage(assistantText, { turnId });
            }
            const cardMessage: ChatMessage = {
              id: event.id,
              role: "assistant",
              content: "",
              action: { id: event.id, kind: event.kind, state: "loading" },
            };
            setMessages((prev) => {
              const next = [...prev, cardMessage];
              messagesRef.current = next;
              return next;
            });
          } else if (event.type === "action_payload") {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.action?.id === event.id
                  ? {
                      ...m,
                      action: {
                        ...m.action,
                        state: "ready" as const,
                        payload: event.data,
                      },
                    }
                  : m,
              );
              messagesRef.current = next;
              return next;
            });
          } else if (event.type === "action_error") {
            setMessages((prev) => {
              const next = prev.filter((m) => m.action?.id !== event.id);
              messagesRef.current = next;
              return next;
            });
          } else if (event.type === "user_transcript") {
            // The LLM chose the coherent transcript. Update the pending student
            // bubble and persist the deferred audio.
            const chosenText = event.text;
            setMessages((prev) =>
              prev.map((m) => {
                if (
                  m.role === "student" &&
                  m.transcriptCandidates?.length &&
                  m.status === "transcribing"
                ) {
                  return { ...m, content: chosenText, transcriptCandidates: undefined, status: undefined };
                }
                return m;
              }),
            );
            messagesRef.current = messagesRef.current.map((m) => {
              if (
                m.role === "student" &&
                m.transcriptCandidates?.length &&
                m.status === "transcribing"
              ) {
                return { ...m, content: chosenText, transcriptCandidates: undefined, status: undefined };
              }
              return m;
            });
            // Persist the deferred audio with the resolved canonical text.
            for (const [msgId, audioBlob] of deferredStudentAudioRef.current) {
              void persistUtteranceAudio({
                dbRole: "student",
                storageRole: "user",
                ordinal: userOrdinalRef.current,
                audioBlob,
                content: chosenText,
                chatMessageId: msgId,
              });
              deferredStudentAudioRef.current.delete(msgId);
            }
          } else if (event.type === "speech_start") {
            if (typeof event.sampleRate === "number" && event.sampleRate > 0) {
              sampleRate = event.sampleRate;
            }
            playback.prepareSegment(0, { sampleRate });
            speechSegmentPrepared = true;
          } else if (event.type === "speech_chunk") {
            if (!speechSegmentPrepared) {
              playback.prepareSegment(0, { sampleRate });
              speechSegmentPrepared = true;
            }
            ttsStarted = true;
            activeAssistantTurnRef.current.ttsStarted = true;
            playback.appendChunk(0, event.base64);
            pcmChunks.push(decodeBase64ToBytes(event.base64));
          } else if (event.type === "error") {
            throw new Error(
              event.error || event.message || "Assistant turn failed",
            );
          }
        }

        if (botInterruptionRequestedRef.current) {
          interrupted = true;
        }
        if (
          speechSegmentPrepared &&
          !speechSegmentEnded &&
          !botInterruptionRequestedRef.current
        ) {
          speechSegmentEnded = true;
          await playback.endSegment(0);
        }
        if (ttsStarted && !botInterruptionRequestedRef.current) {
          await playback.waitForAll();
          await playback.drainScheduledPlayback();
        }

        const committedMsgId = liveAssistantMessageIdRef.current;
        if (!botInterruptionRequestedRef.current) {
          commitAssistantTurnToMessages({ turnId });
        }

        if (!botInterruptionRequestedRef.current) {
          releaseAssistantTurnUi(turnId);
        }

        const totalBytes = pcmChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        if (totalBytes > 0) {
          const pcmBytes = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of pcmChunks) {
            pcmBytes.set(chunk, offset);
            offset += chunk.length;
          }
          const wav = pcmToWavArrayBuffer(pcmBytes, sampleRate);
          const wavBlob = new Blob([wav], { type: "audio/wav" });
          botOrdinalRef.current += 1;
          void persistUtteranceAudio({
            dbRole: "assistant",
            storageRole: "bot",
            ordinal: botOrdinalRef.current,
            audioBlob: wavBlob,
            content: assistantText.trim(),
            generatedContent: assistantText.trim(),
            interrupted,
            chatMessageId: assistantMessageId,
          }).then((result) => {
            if (result?.audioFileUrl && committedMsgId && !botInterruptionRequestedRef.current) {
              messageAudioUrlsRef.current.set(committedMsgId, result.audioFileUrl);
              setMessageAudioAvailableIds((prev) => new Set([...prev, committedMsgId]));
            }
          });
        }
        if (didEndConversation) {
          scheduleAutoFinish();
        }
      } catch (turnError) {
        // Fallback: if the turn errored before user_transcript arrived, resolve
        // any pending dual-transcript bubble to the primary candidate text.
        for (const [msgId, audioBlob] of deferredStudentAudioRef.current) {
          const primaryText = messagesRef.current
            .find((m) => m.role === "student" && m.transcriptCandidates?.length)
            ?.transcriptCandidates?.[0]?.text ?? "";
          if (primaryText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.role === "student" && m.transcriptCandidates?.length
                  ? { ...m, content: primaryText, transcriptCandidates: undefined, status: undefined }
                  : m,
              ),
            );
            messagesRef.current = messagesRef.current.map((m) =>
              m.role === "student" && m.transcriptCandidates?.length
                ? { ...m, content: primaryText, transcriptCandidates: undefined, status: undefined }
                : m,
            );
            void persistUtteranceAudio({
              dbRole: "student",
              storageRole: "user",
              ordinal: userOrdinalRef.current,
              audioBlob,
              content: primaryText,
              chatMessageId: msgId,
            });
          }
          deferredStudentAudioRef.current.delete(msgId);
        }

        if (
          turnError instanceof DOMException &&
          (turnError.name === "AbortError" ||
            turnError.message === "signal is aborted without reason")
        ) {
          if (assistantTurnSeqRef.current === turnId) {
            activeAssistantTurnRef.current.text = assistantText;
            activeAssistantTurnRef.current.ttsStarted =
              activeAssistantTurnRef.current.ttsStarted || ttsStarted;
          }
          commitAssistantTurnToMessages({ force: true, turnId });
          releaseAssistantTurnUi(turnId);
          return;
        }
        releaseAssistantTurnUi(turnId);
        const message =
          turnError instanceof Error
            ? turnError.message
            : "Assistant turn failed";
        setError(message);
        showErrorToast(message);
      } finally {
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    },
    [
      activityType,
      activityDefinitionSnapshot,
      assignmentId,
      nextAttemptNumber,
      botPromptConfig?.multimodal_actions,
      greeting,
      language,
      onIntegrityAccessRevoked,
      playback,
      persistUtteranceAudio,
      question.order,
      releaseAssistantTurnUi,
      scheduleAutoFinish,
      commitAssistantTurnToMessages,
      upsertLiveAssistantMessage,
      speechModels?.ttsModelId,
      submissionId,
      supportEnabled,
      supportLanguage,
      systemPrompt,
    ],
  );

  const handleStart = React.useCallback(async () => {
    if (maxAttemptsReached) {
      showWarningToast(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }
    if (messagesRef.current.length > 0 || isStarting) return;
    sessionStartedAtRef.current = new Date().toISOString();
    setIsStarting(true);
    setExpandedMessageIds({});
    userOrdinalRef.current = 0;
    botOrdinalRef.current = 0;
    setSessionChunkIndex(0);
    // Discard any leftover in-progress conversation for this attempt (e.g. a
    // session abandoned by a page refresh) so old and new turns don't mix and
    // audio utterance ordinals don't collide. Best-effort: continue on failure.
    try {
      await fetch("/api/multimodal/conversation/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          questionOrder: question.order,
          attemptNumber: nextAttemptNumber,
        }),
      });
    } catch (resetError) {
      console.error("Failed to reset prior conversation", resetError);
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        botUserCardsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
    try {
      await runAssistantTurn([]);
    } finally {
      setIsStarting(false);
    }
  }, [
    isStarting,
    maxAttemptsReached,
    nextAttemptNumber,
    question.order,
    runAssistantTurn,
    submissionId,
  ]);

  const handleMcqAnswer = React.useCallback(
    async (messageId: string, choiceIndex: number) => {
      // Allow answering while the bot is still speaking (we interrupt below);
      // only block while the learner is recording or the bot is mid-thought
      // before any speech.
      if (isTranscribing || (isThinking && !isSpeaking)) {
        return;
      }
      const target = messagesRef.current.find((m) => m.id === messageId);
      const action = target?.action;
      if (
        !action ||
        action.state !== "ready" ||
        action.payload?.kind !== "mcq" ||
        action.answeredIndex !== undefined
      ) {
        return;
      }

      // If the bot is still speaking (e.g. it just introduced this question),
      // interrupt that turn so it can respond to the answer.
      if (isSpeaking) {
        botInterruptionRequestedRef.current = true;
        activeAbortRef.current?.abort();
        playback.reset();
        commitAssistantTurnToMessages({
          force: true,
          turnId: assistantTurnSeqRef.current,
        });
        releaseAssistantTurnUi(assistantTurnSeqRef.current);
      }

      const mcq = action.payload;
      const choiceText = mcq.choices[choiceIndex] ?? "";
      const isCorrect = choiceIndex === mcq.correctIndex;

      // Lock the card into its answered state (marks only the picked option).
      const lockedMessages = messagesRef.current.map((m) =>
        m.id === messageId && m.action
          ? { ...m, action: { ...m.action, answeredIndex: choiceIndex } }
          : m,
      );
      setMessages(lockedMessages);
      messagesRef.current = lockedMessages;

      // Persist the answer (fire-and-forget — UI already reflects it).
      void fetch("/api/multimodal/mcq-answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, answeredIndex: choiceIndex }),
      }).catch((err) => {
        console.error("Failed to persist MCQ answer", err);
      });

      // Inject a HIDDEN result note so the tutor can respond verbally and decide
      // whether to re-ask. Not rendered to the learner (no answer/explanation
      // shown on screen) and not logged to chat_messages.
      const optionsList = mcq.choices
        .map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`)
        .join("\n");
      const correctText = mcq.choices[mcq.correctIndex] ?? "";
      const resultNote = [
        "[MCQ result — hidden from the learner]",
        `Question: ${mcq.question}`,
        `Options:\n${optionsList}`,
        `The learner selected: ${choiceText} — ${isCorrect ? "CORRECT" : "INCORRECT"}.`,
        `Correct answer: ${correctText}.`,
        mcq.explanation ? `Explanation: ${mcq.explanation}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const hiddenMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "student",
        content: resultNote,
        hidden: true,
      };
      const nextHistory = [...lockedMessages, hiddenMessage];
      setMessages(nextHistory);
      messagesRef.current = nextHistory;

      await runAssistantTurn(nextHistory);
    },
    [
      isThinking,
      isSpeaking,
      isTranscribing,
      playback,
      commitAssistantTurnToMessages,
      releaseAssistantTurnUi,
      runAssistantTurn,
    ],
  );

  const handleLanguageSupport = React.useCallback(async () => {
    // Same gating as the mic: don't fire while transcribing or while the bot
    // is mid-thought before any speech.
    if (
      isTranscribing ||
      (isThinking && !isSpeaking) ||
      !supportLanguage ||
      supportLanguage === language
    ) {
      return;
    }

    // Interrupt an in-progress spoken turn so the tutor can re-explain.
    if (isSpeaking) {
      botInterruptionRequestedRef.current = true;
      activeAbortRef.current?.abort();
      playback.reset();
      commitAssistantTurnToMessages({
        force: true,
        turnId: assistantTurnSeqRef.current,
      });
      setMessages((prev) => {
        const next = prev.filter((m) => m.action?.state !== "loading");
        messagesRef.current = next;
        return next;
      });
      releaseAssistantTurnUi(assistantTurnSeqRef.current);
    }

    const label =
      getLocaleRegistryMap().get(supportLanguage)?.label ?? supportLanguage;
    // Hidden nudge: an explicit support-language help request injected into the
    // history so the model replies in the support language this turn (the same
    // path a verbal request takes). Never rendered or logged — the spoken reply
    // is the visible result. TTS still renders in the primary voice.
    const hiddenMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "student",
      content: `Please explain that in ${label}.`,
      hidden: true,
    };
    const nextHistory = [...messagesRef.current, hiddenMessage];
    setMessages(nextHistory);
    messagesRef.current = nextHistory;

    await runAssistantTurn(nextHistory);
  }, [
    isTranscribing,
    isThinking,
    isSpeaking,
    supportLanguage,
    language,
    playback,
    commitAssistantTurnToMessages,
    releaseAssistantTurnUi,
    runAssistantTurn,
  ]);

  const handleClientTriggeredAction = React.useCallback(
    async (def: ActionDefinition) => {
      const trigger = def.clientTrigger;
      if (!trigger) return;
      if (isTranscribing || (isThinking && !isSpeaking)) return;

      if (isSpeaking) {
        botInterruptionRequestedRef.current = true;
        activeAbortRef.current?.abort();
        playback.reset();
        commitAssistantTurnToMessages({
          force: true,
          turnId: assistantTurnSeqRef.current,
        });
        setMessages((prev) => {
          const next = prev.filter((m) => m.action?.state !== "loading");
          messagesRef.current = next;
          return next;
        });
        releaseAssistantTurnUi(assistantTurnSeqRef.current);
      }

      const hiddenMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "student",
        content: trigger.hiddenMessage,
        hidden: true,
      };
      const nextHistory = [...messagesRef.current, hiddenMessage];
      setMessages(nextHistory);
      messagesRef.current = nextHistory;

      await runAssistantTurn(nextHistory, {
        availableActionsOverride: [def.kind],
        noSpeech: trigger.noSpeech,
      });
    },
    [
      isTranscribing,
      isThinking,
      isSpeaking,
      playback,
      commitAssistantTurnToMessages,
      releaseAssistantTurnUi,
      runAssistantTurn,
    ],
  );

  const handleRequestTransliteration = React.useCallback(
    async (messageId: string) => {
      const msg = messagesRef.current.find((m) => m.id === messageId);
      if (!msg || msg.role !== "assistant" || !msg.content?.trim()) return;
      if (transliterations[messageId] || transliterationPending[messageId]) return;

      setTransliterationPending((prev) => ({ ...prev, [messageId]: true }));
      try {
        const res = await fetch("/api/multimodal/transliterate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: msg.content,
            fromLanguage: language,
            toLanguage: supportLanguage,
            assignmentId,
          }),
        });
        const data = (await res.json()) as TransliterationResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Transliteration failed");
        setTransliterations((prev) => ({ ...prev, [messageId]: data }));
      } catch (err) {
        showErrorToast(err instanceof Error ? err.message : "Transliteration failed");
      } finally {
        setTransliterationPending((prev) => ({ ...prev, [messageId]: false }));
      }
    },
    [assignmentId, language, supportLanguage, transliterations, transliterationPending],
  );

  const handleReplayAudio = React.useCallback((messageId: string) => {
    const current = replayAudioRef.current;
    // Pause if this message is already playing
    if (current && !current.paused) {
      current.pause();
      setPlayingMessageId(null);
      return;
    }
    // Stop any other replay in progress
    if (current) {
      current.pause();
      replayAudioRef.current = null;
    }
    const url = messageAudioUrlsRef.current.get(messageId);
    if (!url) return;
    const audio = new Audio(url);
    replayAudioRef.current = audio;
    audio.onended = () => {
      replayAudioRef.current = null;
      setPlayingMessageId(null);
    };
    setPlayingMessageId(messageId);
    void audio.play();
  }, []);

  const handleRequestMic = React.useCallback(async () => {
    if (micRequestPending) return;
    setMicRequestPending(true);
    try {
      await requestAccess();
    } finally {
      setMicRequestPending(false);
    }
  }, [micRequestPending, requestAccess]);

  const handleMicPress = React.useCallback(async () => {
    if (maxAttemptsReached || isTranscribing || (isThinking && !isSpeaking)) {
      return;
    }
    recorder.primeAudio();

    if (isSpeaking) {
      botInterruptionRequestedRef.current = true;
      activeAbortRef.current?.abort();
      playback.reset();
      commitAssistantTurnToMessages({
        force: true,
        turnId: assistantTurnSeqRef.current,
      });
      // Drop any still-loading action card so no ghost skeleton remains.
      setMessages((prev) => {
        const next = prev.filter((m) => m.action?.state !== "loading");
        messagesRef.current = next;
        return next;
      });
      releaseAssistantTurnUi(assistantTurnSeqRef.current);
      const started = await recorder.startRecording();
      if (!started && recorder.error) {
        setError(recorder.error);
      }
      return;
    }

    if (recorder.isRecording) {
      const recorded = await recorder.stopRecording();
      if (!recorded || recorded.size < 2000) {
        showWarningToast(
          "Recording too short. Speak for 1-2 seconds and try again.",
        );
        return;
      }
      setIsTranscribing(true);
      try {
        const wavBlob = await tryConvertToWavBlob(recorded);
        const pendingMessageId = crypto.randomUUID();
        const pendingStudentMessage: ChatMessage = {
          id: pendingMessageId,
          role: "student",
          content: "Transcribing...",
          status: "transcribing",
        };
        setMessages((prev) => [...prev, pendingStudentMessage]);
        const historyWithPending = [
          ...messagesRef.current,
          pendingStudentMessage,
        ];
        messagesRef.current = historyWithPending;

        const sttModelId =
          speechModels?.sttModelId ?? DEFAULT_KONVO_SESSION_CONFIG.sttModelId;
        const formData = new FormData();
        formData.append(
          "sessionConfig",
          JSON.stringify({
            language,
            // When support is active, send both languages so the server
            // transcribes in parallel and returns both candidates.
            ...(supportEnabled && supportLanguage ? { supportLanguage } : {}),
            activityType,
            sttModelId,
            ttsModelId:
              speechModels?.ttsModelId ??
              DEFAULT_KONVO_SESSION_CONFIG.ttsModelId,
            llmModelId: DEFAULT_KONVO_SESSION_CONFIG.llmModelId,
          }),
        );
        formData.append(
          "audio",
          new File([wavBlob], "recording.wav", { type: "audio/wav" }),
        );
        formData.append("assignmentId", assignmentId);
        const response = await fetch("/api/multimodal/transcribe", {
          method: "POST",
          body: formData,
        });
        const body = (await response.json().catch(() => ({}))) as {
          text?: string;
          candidates?: { language: string; text: string }[];
          error?: string;
          details?: string;
        };
        if (!response.ok) {
          throw new Error(body.details ?? body.error ?? "Transcription failed");
        }
        const text = (body.text ?? "").trim();
        if (!text) {
          setMessages((prev) => prev.filter((m) => m.id !== pendingMessageId));
          showWarningToast(
            "No speech detected. Try speaking louder and closer to the mic.",
          );
          return;
        }

        const isDual = Array.isArray(body.candidates) && body.candidates.length >= 2;

        const studentMessage: ChatMessage = {
          id: pendingMessageId,
          role: "student",
          content: isDual ? text : text,
          ...(isDual ? { transcriptCandidates: body.candidates, status: "transcribing" as const } : {}),
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingMessageId ? studentMessage : m)),
        );
        const nextHistory = historyWithPending.map((m) =>
          m.id === pendingMessageId ? studentMessage : m,
        );
        messagesRef.current = nextHistory;
        userOrdinalRef.current += 1;

        if (isDual) {
          // Defer audio persistence until the user_transcript SSE event resolves.
          deferredStudentAudioRef.current.set(pendingMessageId, wavBlob);
        } else {
          await persistUtteranceAudio({
            dbRole: "student",
            storageRole: "user",
            ordinal: userOrdinalRef.current,
            audioBlob: wavBlob,
            content: text,
            chatMessageId: pendingMessageId,
          });
        }

        setIsTranscribing(false);
        await runAssistantTurn(nextHistory);
      } catch (sendError) {
        setMessages((prev) => prev.filter((m) => m.status !== "transcribing"));
        const message =
          sendError instanceof Error
            ? sendError.message
            : "Failed to process audio";
        setError(message);
        showErrorToast(message);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }
    try {
      const started = await recorder.startRecording();
      if (!started && recorder.error) {
        setError(recorder.error);
      }
    } catch {
      showErrorToast("Unable to start recording.");
    }
  }, [
    assignmentId,
    activityType,
    isSpeaking,
    isThinking,
    isTranscribing,
    maxAttemptsReached,
    persistUtteranceAudio,
    playback,
    recorder,
    commitAssistantTurnToMessages,
    releaseAssistantTurnUi,
    runAssistantTurn,
    speechModels?.sttModelId,
    speechModels?.ttsModelId,
    language,
    supportEnabled,
    supportLanguage,
  ]);

  return (
    <div className="relative space-y-4">
      {!hasStarted ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Begin the activity by clicking the button below and talk to the AI
            assistant.
            <br /> Wait for the assistant to start speaking. You can speak by
            clicking the microphone icon.
          </p>
          <Button type="button" className="gap-2" onClick={handleStart}>
            <Play className="h-4 w-4" />
            {isStarting ? "Starting..." : "Start Activity"}
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            APP_ASSESSMENT_SHELL_CLASS,
            "min-h-[420px] flex flex-col",
          )}
        >
          {error ? (
            <div
              role="alert"
              className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {micPermission !== "granted" ? (
            <div className="mb-2 flex flex-col items-center gap-2">
              {micPermission === "denied" ? (
                <>
                  <Button type="button" disabled variant="secondary">
                    Microphone blocked
                  </Button>
                  <p className="text-xs text-center text-muted-foreground max-w-lg">
                    Microphone access is blocked. Update site permissions in
                    your browser settings, then reload the page.
                  </p>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleRequestMic()}
                  disabled={micRequestPending}
                >
                  {micRequestPending
                    ? "Waiting for permission..."
                    : "Allow microphone access"}
                </Button>
              )}
            </div>
          ) : null}

          <div className="relative">
            <ContentBox
              content={null}
              messages={messages}
              expandedMessageIds={expandedMessageIds}
              onToggleExpanded={(messageId) =>
                setExpandedMessageIds((prev) => ({
                  ...prev,
                  [messageId]: !prev[messageId],
                }))
              }
              onMcqAnswer={(messageId, choiceIndex) =>
                void handleMcqAnswer(messageId, choiceIndex)
              }
              transliterationEnabled={transliterationEnabled}
              transliterations={transliterations}
              transliterationPending={transliterationPending}
              onRequestTransliteration={(id) => void handleRequestTransliteration(id)}
              audioAvailableIds={messageAudioAvailableIds}
              onReplayAudio={handleReplayAudio}
              playingMessageId={playingMessageId}
              ttsConfig={{
                ttsModelId:
                  speechModels?.ttsModelId ?? DEFAULT_KONVO_SESSION_CONFIG.ttsModelId,
                assignmentId,
                language,
              }}
            />
            {(() => {
              const bulbDef = resolveBulbAction(
                activityDefinitionSnapshot,
                activityType,
              );
              if (bulbDef) {
                return (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => void handleClientTriggeredAction(bulbDef)}
                    disabled={isTranscribing || (isThinking && !isSpeaking)}
                    title={bulbDef.clientTrigger?.bulbTooltip ?? "Get help"}
                    aria-label={bulbDef.clientTrigger?.bulbTooltip ?? "Get help"}
                    className="absolute bottom-3 right-3 z-10 h-11 w-11 rounded-full border border-amber-300 bg-amber-50 text-amber-600 shadow-md hover:bg-amber-100 hover:text-amber-700"
                  >
                    <Lightbulb className="h-5 w-5" />
                  </Button>
                );
              }
              return null;
            })()}
            {!resolveBulbAction(activityDefinitionSnapshot, activityType) &&
            supportEnabled ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void handleLanguageSupport()}
                disabled={isTranscribing || (isThinking && !isSpeaking)}
                title={`Explain again in ${
                  getLocaleRegistryMap().get(supportLanguage ?? "")?.label ??
                  "your support language"
                }`}
                aria-label="Explain again in your support language"
                className="absolute bottom-3 right-3 z-10 h-11 w-11 rounded-full border border-amber-300 bg-amber-50 text-amber-600 shadow-md hover:bg-amber-100 hover:text-amber-700"
              >
                <Lightbulb className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
          <div
            ref={botUserCardsRef}
            className="flex flex-col md:flex-row gap-4 shrink-0 min-h-[150px]"
          >
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                ui.botExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <BotStatusPanel
                uiState={ui.uiState}
                focused={ui.botExpanded}
                showBotWave={ui.showBotWave}
                botWaveMode={ui.botWaveMode}
                playbackAnalyser={playback.playbackAnalyser}
              />
            </div>
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                ui.userExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <UserInputPanel
                ui={ui}
                canSend={recorder.isRecording && !isTranscribing}
                recorder={recorder}
                onMicPress={() => void handleMicPress()}
                onSend={() => void handleMicPress()}
                micAccessory={null}
              />
            </div>
          </div>

          <div className="mt-2 flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleFinishAndEvaluate()}
              disabled={
                isEvaluating ||
                maxAttemptsReached ||
                isThinking ||
                isTranscribing
              }
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Evaluating...
                </>
              ) : (
                "Finish & Evaluate"
              )}
            </Button>
          </div>
        </div>
      )}
      {maxAttemptsReached && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum attempts reached.
        </p>
      )}
      {isEvaluating ? <EvaluatingIndicator /> : null}
      {micRequestPending ? (
        <div
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Waiting for microphone permission"
        >
          <Loader2
            className="h-10 w-10 animate-spin text-primary"
            aria-hidden
          />
          <p className="max-w-sm px-4 text-center text-sm font-medium text-foreground">
            Use your browser&apos;s microphone prompt to allow or block access.
          </p>
        </div>
      ) : null}
    </div>
  );
}
