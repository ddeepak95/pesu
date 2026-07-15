"use client";

import React from "react";
import { Lightbulb, Loader2, Play } from "lucide-react";
import type { TransliterationResult } from "@/lib/ai/schemas/transliteration";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useMultimodalSpeechModels } from "@/hooks/swr/useMultimodalSpeechModels";
import { useInteractionSupportByAssignment } from "@/hooks/swr/useAudioInputSupport";
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
import type {
  PendingAction,
  ChatTurnError,
} from "@/components/Shared/KonvoVoice/actionTypes";
import type { AiErrorCode } from "@/lib/ai/errors";
import type {
  ActionKind,
  ActionPayload,
} from "@/lib/multimodal/actions/types";
import type { ActionInput } from "@/lib/multimodal/actions/schema";
import {
  type ActionDefinition,
  getActionDefinition,
  resolveAutoActions,
  resolveBulbAction,
} from "@/lib/multimodal/actions/registry";
import { useEndConversationFinish } from "./useEndConversationFinish";
import type { AssessmentInputProps } from "./types";
import { INTEGRITY_ACCESS_REVOKED_ERROR_CODE } from "@/lib/integrity/constants";
import { AI_NOT_CONFIGURED_ERROR_CODE } from "@/lib/ai/credentials/constants";
import { MULTIMODAL_ERROR_CODES } from "@/lib/multimodal/errorCodes";
import { DIRECT_AUDIO_INPUT_MAX_BYTES } from "@/lib/multimodal/turnConfig";
import { isSarvamSttCatalogModel } from "@/lib/konvo-voice/speech/constants";
import { splitAudioForSarvam } from "@/lib/konvo-voice/speech/splitAudioForSarvam";
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
  /** True for a text-typed student message (no audio — show text, not a waveform). */
  typed?: boolean;
  /** Present on a failed AI-turn bubble — renders the retry UI in place. */
  error?: ChatTurnError;
  /**
   * Both transcript candidates when dual-language transcription was used.
   * Present only on the latest student message while the LLM is resolving
   * which reading is correct. Cleared once `user_transcript` arrives.
   */
  transcriptCandidates?: { language: string; text: string }[];
}

interface RunTurnOpts {
  availableActionsOverride?: ActionKind[];
  noSpeech?: boolean;
  /** Direct-audio-input mode: the learner's raw utterance, sent inline instead of transcribed text. */
  latestUserAudio?: { base64: string; mimeType: string };
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
  | {
      type: "action_start";
      id: string;
      kind: ActionKind;
      input?: ActionInput;
      chatMessageId?: string;
    }
  | { type: "action_payload"; id: string; kind: ActionKind; data: ActionPayload }
  | {
      type: "action_error";
      id: string;
      kind: ActionKind;
      error?: string;
      code?: AiErrorCode;
      retryable?: boolean;
      retryAfterMs?: number;
    }
  | { type: "user_transcript"; text: string }
  | { type: "user_transcript_empty" }
  | { type: "retrying"; attempt: number }
  | { type: "done" }
  | {
      type: "error";
      error?: string;
      message?: string;
      code?: AiErrorCode;
      retryable?: boolean;
      retryAfterMs?: number;
    };

// Resolves what a message "truthfully" contributed to the conversation. Action
// cards are stored with content:"" (the real content lives in action.payload,
// rendered only as a UI card) — without this, they're invisible everywhere
// text is needed: the history sent back to the model, and the eval transcript.
function resolveMessageContent(m: ChatMessage): string {
  if (m.content.trim()) return m.content;
  if (m.action?.payload) {
    return (
      getActionDefinition(m.action.kind).serializeForTranscript?.(
        m.action.payload,
        m.action.answeredIndex,
      ) ?? ""
    );
  }
  return "";
}

// Full bidirectional conversation transcript sent to the evaluator
// (Student:/Bot: per turn), resolving action cards via resolveMessageContent
// so all action kinds appear truthfully, answered or not.
function formatFullConversationTranscript(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.hidden) continue;
    const content = resolveMessageContent(m).trim();
    if (!content) continue;
    const label = m.role === "student" ? "Student" : "Tutor";
    parts.push(`${label}: ${content}`);
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

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
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
  allowCopyPaste,
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
  // True during a silent server retry backoff (SSE "retrying" event) so the bot
  // panel can show "Reconnecting…" instead of silent dead air.
  const [isReconnecting, setIsReconnecting] = React.useState(false);
  // Count of manual retries triggered from a failed-turn bubble (for the
  // "Retry (n)" label). See dev-docs/ai-retry-and-failure-recovery-plan.md §5.
  const [turnRetryCount, setTurnRetryCount] = React.useState(0);
  const [micRequestPending, setMicRequestPending] = React.useState(false);
  const [sessionChunkIndex, setSessionChunkIndex] = React.useState(0);
  const [textDraft, setTextDraft] = React.useState("");
  // True while the learner is focused on / holding a text draft — expands the
  // user panel over the bot panel even while the tutor is still speaking.
  const [textComposing, setTextComposing] = React.useState(false);
  // Learner input (text + mic) stays disabled until the tutor's first message
  // has started (spoken, or its text has begun streaming).
  const [hasBotStarted, setHasBotStarted] = React.useState(false);

  // Client-minted attempt-session id: a page refresh is a fresh mount, so this
  // naturally produces a new id with zero persistence logic — the desired
  // "refresh = new session" behavior. Foundation-only data capture (see
  // dev-docs/question-stable-ids-plan.md § attempt_session_id); no
  // abandonment-detection logic or resume UI reads this yet.
  const sessionIdRef = React.useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = crypto.randomUUID();
  }
  const sessionId = sessionIdRef.current;

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

  // Direct audio input: send the learner's raw utterance straight to the chat
  // model, bypassing the /transcribe round trip. See
  // dev-docs/multimodal-interaction-config-plan.md.
  const directAudioInputEnabled =
    (botPromptConfig?.multimodal_interaction?.input?.audioDelivery ?? "transcribe") ===
    "direct";

  // Which input methods the learner may use, and how the tutor's reply is
  // delivered. Unset ⇒ audio-only + automatic speech (today's behavior).
  const configuredModes =
    botPromptConfig?.multimodal_interaction?.input?.modes?.length
      ? botPromptConfig.multimodal_interaction.input.modes
      : (["audio"] as ("text" | "audio")[]);
  const speechMode =
    botPromptConfig?.multimodal_interaction?.output?.speechMode ?? "automatic";

  // Live capability check: audio input is only usable when STT or direct-audio
  // is genuinely available for this class, even if the teacher selected it.
  const { data: interactionSupport } =
    useInteractionSupportByAssignment(assignmentId);
  const audioInputAvailable = interactionSupport?.audioInputAvailable;

  const audioInputEnabled =
    configuredModes.includes("audio") && audioInputAvailable !== false;
  // Recovery: never leave the activity with no usable input method.
  const textInputEnabled =
    configuredModes.includes("text") || !audioInputEnabled;

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
  // Classified error captured from the turn's SSE `error` event (set just before
  // the loop throws) so the catch can decide bubble-vs-banner from the code.
  const turnErrorRef = React.useRef<ChatTurnError | null>(null);
  // Snapshot of the last failed AI turn, powering the failed-turn bubble's
  // Retry. Kept in a ref (not message state) because opts can carry large audio.
  const failedTurnRef = React.useRef<{
    opts?: RunTurnOpts;
    error: ChatTurnError;
    partial: boolean;
  } | null>(null);
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
    if (hasBotStarted) return;
    const botStarted =
      isSpeaking ||
      messages.some(
        (m) => m.role === "assistant" && m.content.trim().length > 0,
      );
    if (botStarted) setHasBotStarted(true);
  }, [hasBotStarted, isSpeaking, messages]);

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

  // Fire-and-forget: stamp attempt_sessions.started_at at true page-load time.
  // Not load-bearing for correctness — every child-writing route also calls
  // ensureAttemptSession before its own insert, so a slow/failed request here
  // never blocks a chat/transcript write (see dev-docs/question-stable-ids-plan.md).
  React.useEffect(() => {
    void fetch("/api/multimodal/attempt-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        submissionId,
        questionId: question.id,
        attemptNumber: nextAttemptNumber,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      formData.append("questionId", question.id);
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
      question.id,
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
        formData.append("questionId", question.id);
        formData.append("sessionId", sessionId);
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
      question.id,
      sessionId,
      submissionId,
    ],
  );

  const finishSubmission = React.useCallback(async () => {
    const answerText = formatFullConversationTranscript(messagesRef.current).trim();
    // handleEvaluate re-throws on failure (a contract the static-text input relies
    // on for answer preservation). Here the transcript already lives in messagesRef
    // and the failure is shown via the retry card, so swallow it to avoid an
    // unhandled rejection propagating up through runFinish's void call.
    try {
      await onSubmitForEvaluation(answerText);
    } catch {
      /* surfaced in-place by AssessmentShell's retry card */
    }
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
          // Reuse the turn's live id so persisted bot audio (linked by this id)
          // matches the bubble and its replay/play button resolves.
          id: liveId ?? crypto.randomUUID(),
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
      setIsReconnecting(false);
      playback.releasePlayback();
    },
    [playback],
  );

  const runAssistantTurn = React.useCallback(
    async (history: ChatMessage[], opts?: RunTurnOpts) => {
      const turnId = ++assistantTurnSeqRef.current;
      setIsAssistantTurnActive(true);
      setIsThinking(true);
      setIsSpeaking(false);
      setError(null);
      setIsReconnecting(false);
      turnErrorRef.current = null;
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

      // Persist whatever bot audio has been collected so far and mark the bubble
      // replayable. Runs on normal completion AND on the interrupt/abort path so a
      // cut-off reply still gets a play button — a text interruption typically
      // aborts mid-stream (no recording delay), which throws into the catch below
      // before the normal post-stream persist; without this the interrupted bubble
      // would never register its audio. Idempotent so the two call sites can't
      // double-persist.
      let botAudioPersisted = false;
      const persistBotAudioIfAny = () => {
        if (botAudioPersisted) return;
        const totalBytes = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (totalBytes === 0) return;
        botAudioPersisted = true;
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
          if (result?.audioFileUrl) {
            messageAudioUrlsRef.current.set(assistantMessageId, result.audioFileUrl);
            setMessageAudioAvailableIds((prev) => new Set([...prev, assistantMessageId]));
          }
        });
      };

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
            activityDefinitionSnapshot,
            assignmentId,
            submissionId,
            questionOrder: question.order,
            questionId: question.id,
            sessionId,
            attemptNumber,
            messages: history
              .map((m) => ({ ...m, content: resolveMessageContent(m) }))
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
            ...(opts?.latestUserAudio ? { latestUserAudio: opts.latestUserAudio } : {}),
            availableActions: (() => {
              if (opts?.availableActionsOverride) return opts.availableActionsOverride;
              const auto = resolveAutoActions(activityDefinitionSnapshot, activityType);
              const configured = botPromptConfig?.multimodal_actions?.availableActions ?? [];
              return [...auto, ...configured.filter((k) => !auto.includes(k))];
            })(),
            endConversationConfig:
              botPromptConfig?.multimodal_actions?.endConversation,
            ...(opts?.noSpeech ? { noSpeech: true } : {}),
            speechMode,
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
          if (
            response.status === 409 &&
            errorData.code === MULTIMODAL_ERROR_CODES.AUDIO_INPUT_CAPABILITY_MISMATCH
          ) {
            throw new Error(
              errorData.error ||
                "This activity's AI configuration no longer supports direct audio input to the model. Please contact your administrator.",
            );
          }
          throw new Error(errorData.error || "Failed to stream assistant turn");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        for await (const event of parseMultimodalTurnStream(reader)) {
          if (event.type === "retrying") {
            // Silent server retry in progress — surface "Reconnecting…".
            setIsReconnecting(true);
          } else if (event.type === "text-delta") {
            setIsReconnecting(false);
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
              action: {
                id: event.id,
                kind: event.kind,
                state: "loading",
                input: event.input,
                chatMessageId: event.chatMessageId,
              },
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
            // Keep the card in an error state (with the classified failure) so
            // the tutor's spoken reference to it stays coherent and the learner
            // can retry generation — no longer silently removed. See plan §6.
            const classified: ChatTurnError = {
              code: event.code ?? "UNKNOWN",
              message: event.error || "Couldn't prepare this — please retry.",
              retryable: event.retryable ?? true,
              ...(event.retryAfterMs ? { retryAfterMs: event.retryAfterMs } : {}),
            };
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.action?.id === event.id
                  ? {
                      ...m,
                      action: {
                        ...m.action,
                        state: "error" as const,
                        error: classified,
                      },
                    }
                  : m,
              );
              messagesRef.current = next;
              return next;
            });
          } else if (event.type === "user_transcript") {
            // The LLM resolved the canonical transcript — either its pick
            // between two dual-STT readings, or (direct-audio mode) its own
            // transcription of the raw audio. Update the pending student
            // bubble and persist the deferred audio.
            const chosenText = event.text;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.role === "student" && m.status === "transcribing") {
                  return { ...m, content: chosenText, transcriptCandidates: undefined, status: undefined };
                }
                return m;
              }),
            );
            messagesRef.current = messagesRef.current.map((m) => {
              if (m.role === "student" && m.status === "transcribing") {
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
              }).then((result) => {
                // Mark the student's own audio replayable so the bubble shows a
                // play button (mirrors the assistant persist path below).
                if (result?.audioFileUrl) {
                  messageAudioUrlsRef.current.set(msgId, result.audioFileUrl);
                  setMessageAudioAvailableIds((prev) => new Set([...prev, msgId]));
                }
              });
              deferredStudentAudioRef.current.delete(msgId);
            }
          } else if (event.type === "user_transcript_empty") {
            // Direct-audio mode: the model detected no speech in the audio.
            // Discard the pending bubble and any queued audio upload —
            // mirrors the pre-flight "No speech detected" 422 the /transcribe
            // path already handles before ever calling this route.
            setMessages((prev) => {
              const next = prev.filter(
                (m) => !(m.role === "student" && m.status === "transcribing"),
              );
              messagesRef.current = next;
              return next;
            });
            deferredStudentAudioRef.current.clear();
            showWarningToast(
              "No speech detected. Try speaking louder and closer to the mic.",
            );
          } else if (event.type === "speech_start") {
            setIsReconnecting(false);
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
            // Capture the machine-readable classification so the catch can
            // decide failed-turn bubble (retryable) vs banner (non-retryable).
            const message =
              event.error || event.message || "Assistant turn failed";
            turnErrorRef.current = {
              code: event.code ?? "UNKNOWN",
              message,
              retryable: event.retryable ?? true,
              ...(event.retryAfterMs
                ? { retryAfterMs: event.retryAfterMs }
                : {}),
            };
            throw new Error(message);
          }
        }

        // An interruption sets botInterruptionRequestedRef, but the *next* turn's
        // runAssistantTurn resets it to false at its start. Once the stream's own
        // waits are unblocked by the interrupt (playback.reset aborts them), this
        // loop can resume *after* the next turn already began — so also treat the
        // turn as interrupted when a newer turn has superseded it. Otherwise the
        // stale loop would run waitForAll/drain/commit against the next turn's
        // shared playback queue and break its first reply.
        const turnInterrupted = () =>
          botInterruptionRequestedRef.current ||
          assistantTurnSeqRef.current !== turnId;

        if (turnInterrupted()) {
          interrupted = true;
        }
        if (speechSegmentPrepared && !speechSegmentEnded && !turnInterrupted()) {
          speechSegmentEnded = true;
          await playback.endSegment(0);
        }
        if (ttsStarted && !turnInterrupted()) {
          await playback.waitForAll();
          await playback.drainScheduledPlayback();
        }

        if (!turnInterrupted()) {
          commitAssistantTurnToMessages({ turnId });
        }

        if (!turnInterrupted()) {
          releaseAssistantTurnUi(turnId);
        }

        persistBotAudioIfAny();
        if (didEndConversation) {
          scheduleAutoFinish();
        }
      } catch (turnError) {
        const isAbort =
          turnError instanceof DOMException &&
          (turnError.name === "AbortError" ||
            turnError.message === "signal is aborted without reason");

        // Retryable AI-turn failure (classified from the SSE error event): show
        // an in-conversation failed-turn bubble with a Retry button instead of
        // the banner, and leave pending student bubbles + deferred audio intact
        // so the retry can re-resolve/re-send. Non-retryable and pre-turn
        // failures fall through to the salvage loop + banner below.
        const classified = turnErrorRef.current;
        turnErrorRef.current = null;
        if (!isAbort && classified && classified.retryable) {
          setIsReconnecting(false);
          const partial = assistantText.trim().length > 0;
          if (partial) {
            // Commit the partial reply so it stays in the conversation; the
            // retry continues as a new turn (with a hidden continue-note).
            if (assistantTurnSeqRef.current === turnId) {
              activeAssistantTurnRef.current.text = assistantText;
              activeAssistantTurnRef.current.ttsStarted =
                activeAssistantTurnRef.current.ttsStarted || ttsStarted;
            }
            interrupted = true;
            commitAssistantTurnToMessages({ force: true, turnId });
            persistBotAudioIfAny();
          }
          releaseAssistantTurnUi(turnId);
          failedTurnRef.current = { opts, error: classified, partial };
          const errorBubble: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            error: classified,
          };
          setMessages((prev) => {
            const next = [...prev, errorBubble];
            messagesRef.current = next;
            return next;
          });
          return;
        }

        // Fallback: the turn request failed before its user_transcript event
        // arrived, so no deferred audio was flushed. Resolve each pending
        // bubble to its already-known content (the primary candidate for
        // dual-transcript bubbles, the plain transcript otherwise).
        for (const [msgId, audioBlob] of deferredStudentAudioRef.current) {
          const pendingMessage = messagesRef.current.find(
            (m) => m.id === msgId && m.role === "student",
          );
          const resolvedText =
            pendingMessage?.transcriptCandidates?.[0]?.text ?? pendingMessage?.content ?? "";
          if (resolvedText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, content: resolvedText, transcriptCandidates: undefined, status: undefined }
                  : m,
              ),
            );
            messagesRef.current = messagesRef.current.map((m) =>
              m.id === msgId
                ? { ...m, content: resolvedText, transcriptCandidates: undefined, status: undefined }
                : m,
            );
            void persistUtteranceAudio({
              dbRole: "student",
              storageRole: "user",
              ordinal: userOrdinalRef.current,
              audioBlob,
              content: resolvedText,
              chatMessageId: msgId,
            }).then((result) => {
              if (result?.audioFileUrl) {
                messageAudioUrlsRef.current.set(msgId, result.audioFileUrl);
                setMessageAudioAvailableIds((prev) => new Set([...prev, msgId]));
              }
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
          // Aborted mid-stream (e.g. a typed interruption): persist whatever bot
          // audio arrived so the cut-off bubble still gets its replay button.
          interrupted = true;
          persistBotAudioIfAny();
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
      question.id,
      sessionId,
      releaseAssistantTurnUi,
      scheduleAutoFinish,
      commitAssistantTurnToMessages,
      upsertLiveAssistantMessage,
      speechModels?.ttsModelId,
      submissionId,
      supportEnabled,
      supportLanguage,
      systemPrompt,
      speechMode,
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
    setHasBotStarted(false);
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
          questionId: question.id,
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
    question.id,
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
      // Also finalize any still-streaming assistant bubble: the interrupt above
      // commits it via a functional setMessages, but messagesRef.current can
      // still hold the streaming version, so this plain-value setMessages would
      // clobber the commit and leave the interrupted bubble stuck as
      // `streaming: true` — which suppresses its replay (play) button and
      // done-speaking status. Mirror the finalization handleTextSubmit does.
      const lockedMessages = messagesRef.current.map((m) => {
        if (m.id === messageId && m.action) {
          return { ...m, action: { ...m.action, answeredIndex: choiceIndex } };
        }
        if (m.role === "assistant" && m.streaming) {
          return { ...m, streaming: false, content: m.content.trim() || "..." };
        }
        return m;
      });
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

      // Inject a minimal HIDDEN nudge so the tutor generates a new turn (the
      // preceding message is assistant-role, so a trailing student-role
      // message is needed to prompt a reply). The full question/options/
      // correctness/explanation no longer need restating here — the action
      // card itself (now carrying `answeredIndex`) already resolves to that
      // full text via `resolveMessageContent`, so it's part of the history
      // this very turn sends to the model.
      const hiddenMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "student",
        content: `[The learner just answered the question above: ${choiceText} — ${isCorrect ? "correct" : "incorrect"}.]`,
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
    // Finalize any still-streaming assistant bubble (see handleMcqAnswer): a
    // plain-value setMessages from the ref would otherwise re-clobber the
    // interrupt's commit and hide the interrupted bubble's play button.
    const finalized = messagesRef.current
      .filter((m) => m.action?.state !== "loading")
      .map((m) =>
        m.role === "assistant" && m.streaming
          ? { ...m, streaming: false, content: m.content.trim() || "..." }
          : m,
      );
    const nextHistory = [...finalized, hiddenMessage];
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
      // Finalize any still-streaming assistant bubble (see handleMcqAnswer) so
      // the plain-value setMessages doesn't re-clobber the interrupt's commit
      // and hide the interrupted bubble's play button.
      const finalized = messagesRef.current
        .filter((m) => m.action?.state !== "loading")
        .map((m) =>
          m.role === "assistant" && m.streaming
            ? { ...m, streaming: false, content: m.content.trim() || "..." }
            : m,
        );
      const nextHistory = [...finalized, hiddenMessage];
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
      const { blob: recorded, durationMs: recordedDurationMs } =
        await recorder.stopRecording();
      if (!recorded || recorded.size < 2000) {
        showWarningToast(
          "Recording too short. Speak for 1-2 seconds and try again.",
        );
        return;
      }

      if (directAudioInputEnabled) {
        setIsTranscribing(true);
        try {
          // Send the browser's native compressed recording straight to the model
          // — no WAV conversion for this path. A spike confirmed Gemini accepts
          // the recorder's real output (webm/opus, ogg/opus, mp4/aac, with their
          // exact codec parameters) with 100% transcript accuracy, at roughly
          // 6-9% of uncompressed WAV's size — a much bigger win than downsampling
          // WAV would have been, and it needs no new client-side conversion step.
          // (Archival persistence below still uses a separate WAV conversion —
          // that's an unrelated, already-working pipeline this doesn't touch.)
          const audioMimeType = recorded.type || "audio/webm";

          // Client-side pre-flight cap (dev-docs/multimodal-interaction-config-plan.md
          // §7.2) — reject oversized recordings before sending rather than let the
          // provider's inline-request size limit fail the turn. Compressed audio
          // makes this cap extremely unlikely to trigger in practice; it's a
          // defensive backstop, not a normal-case limiter.
          if (recorded.size > DIRECT_AUDIO_INPUT_MAX_BYTES) {
            showWarningToast(
              "Recording too long for direct audio input. Please record a shorter message.",
            );
            return;
          }

          const pendingMessageId = crypto.randomUUID();
          const pendingStudentMessage: ChatMessage = {
            id: pendingMessageId,
            role: "student",
            content: "Processing...",
            status: "transcribing",
          };
          setMessages((prev) => [...prev, pendingStudentMessage]);
          const historyWithPending = [
            ...messagesRef.current,
            pendingStudentMessage,
          ];
          messagesRef.current = historyWithPending;

          const base64Audio = await blobToBase64(recorded);
          userOrdinalRef.current += 1;

          // Defer audio persistence until the turn's `user_transcript` SSE event
          // confirms the chat_messages row exists — same FK-ordering rule the
          // transcribe path below follows. Persistence still converts to WAV
          // (unrelated to what's sent to the model, see persistUtteranceAudio).
          const wavBlobForArchive = await tryConvertToWavBlob(recorded);
          deferredStudentAudioRef.current.set(pendingMessageId, wavBlobForArchive);

          setIsTranscribing(false);
          await runAssistantTurn(historyWithPending, {
            latestUserAudio: { base64: base64Audio, mimeType: audioMimeType },
          });
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
        const audioSegments = isSarvamSttCatalogModel(sttModelId)
          ? await splitAudioForSarvam(wavBlob)
          : [wavBlob];
        if (audioSegments.length > 1) {
          formData.append("segmentCount", String(audioSegments.length));
          audioSegments.forEach((segment, i) => {
            formData.append(
              `audio_${i}`,
              new File([segment], `recording_${i}.wav`, { type: "audio/wav" }),
            );
          });
        } else {
          formData.append(
            "audio",
            new File([wavBlob], "recording.wav", { type: "audio/wav" }),
          );
        }
        formData.append("assignmentId", assignmentId);
        formData.append("submissionId", submissionId);
        formData.append("questionOrder", String(question.order));
        formData.append("questionId", question.id);
        formData.append("sessionId", sessionId);
        formData.append("attemptNumber", String(nextAttemptNumber));
        if (recordedDurationMs != null) {
          formData.append("recordingDurationMs", String(recordedDurationMs));
        }
        const response = await fetch("/api/multimodal/transcribe", {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(45_000),
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

        // Defer audio persistence until the turn's `user_transcript` SSE event
        // confirms the chat_messages row exists — persisting eagerly here can
        // race ahead of that insert and violate the audio row's FK.
        deferredStudentAudioRef.current.set(pendingMessageId, wavBlob);

        setIsTranscribing(false);
        await runAssistantTurn(nextHistory);
      } catch (sendError) {
        setMessages((prev) => prev.filter((m) => m.status !== "transcribing"));
        const message =
          sendError instanceof Error && sendError.name === "TimeoutError"
            ? "Transcription is taking too long. Please try again."
            : sendError instanceof Error
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
    directAudioInputEnabled,
    submissionId,
    question.order,
    question.id,
    sessionId,
    nextAttemptNumber,
  ]);

  // Text input: build a student message from typed text and run the turn —
  // mirrors the post-transcribe path minus audio/transcription. Typed input can
  // interject a spoken reply (same interrupt as tapping the mic while speaking).
  const canSubmitText =
    !maxAttemptsReached && !isTranscribing && !(isThinking && !isSpeaking);

  const handleTextSubmit = React.useCallback(async () => {
    const content = textDraft.trim();
    if (!content) return;
    if (maxAttemptsReached || isTranscribing || (isThinking && !isSpeaking)) {
      return;
    }

    // Interrupt an in-progress spoken reply so the typed message can interject.
    // When speaking, the SSE stream is already done, so aborting won't throw —
    // runAssistantTurn deliberately skips its own commit while interruption is
    // requested, so (like the mic path) we finalize the bubble here.
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

    const studentMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "student",
      content,
      typed: true,
    };
    // Build the next turn's history from the *finalized* messages: the commit
    // above finalizes the interrupted bubble via a functional setMessages, so a
    // plain-value setMessages built from the stale (still "streaming") ref would
    // clobber it. Mirror the finalization here and drop loading action cards.
    const finalized = messagesRef.current
      .filter((m) => m.action?.state !== "loading")
      .map((m) =>
        m.role === "assistant" && m.streaming
          ? { ...m, streaming: false, content: m.content.trim() || "..." }
          : m,
      );
    const nextHistory = [...finalized, studentMessage];
    setMessages(nextHistory);
    messagesRef.current = nextHistory;
    userOrdinalRef.current += 1;
    setTextDraft("");
    await runAssistantTurn(nextHistory);
  }, [
    textDraft,
    maxAttemptsReached,
    isTranscribing,
    isThinking,
    isSpeaking,
    playback,
    commitAssistantTurnToMessages,
    releaseAssistantTurnUi,
    runAssistantTurn,
  ]);

  // Retry a failed AI turn from its failed-turn bubble. Rebuilds the history
  // from the current messages (picking up any resolved transcripts and the
  // committed partial reply), drops the direct-audio payload when the transcript
  // already resolved, and appends a hidden continue-note for partial deliveries.
  // See dev-docs/ai-retry-and-failure-recovery-plan.md §5.
  const retryFailedTurn = React.useCallback(async () => {
    const failed = failedTurnRef.current;
    if (!failed || isAssistantTurnActive) return;
    failedTurnRef.current = null;

    // Remove the failed-turn bubble(s).
    const withoutError = messagesRef.current.filter((m) => !m.error);
    setMessages(withoutError);
    messagesRef.current = withoutError;
    setTurnRetryCount((c) => c + 1);

    // Rebuild history from current messages: finalize any streaming bubble and
    // drop still-loading action cards.
    let history = messagesRef.current
      .filter((m) => m.action?.state !== "loading")
      .map((m) =>
        m.role === "assistant" && m.streaming
          ? { ...m, streaming: false, content: m.content.trim() || "..." }
          : m,
      );

    // Audio-vs-transcript decision: if the latest student turn already resolved
    // (no longer transcribing), retry with the resolved text and drop the
    // stored audio — cheaper and deterministic. Otherwise keep it so the model
    // re-resolves the transcript.
    const lastStudent = [...history]
      .reverse()
      .find((m) => m.role === "student" && !m.hidden);
    const transcriptResolved = lastStudent
      ? lastStudent.status !== "transcribing"
      : true;
    let opts = failed.opts;
    if (transcriptResolved && opts?.latestUserAudio) {
      opts = { ...opts, latestUserAudio: undefined };
    }

    if (failed.partial) {
      const continueNote: ChatMessage = {
        id: crypto.randomUUID(),
        role: "student",
        content:
          "[Your previous reply was cut off by a technical error mid-sentence. Continue the conversation naturally; briefly restate anything essential.]",
        hidden: true,
      };
      history = [...history, continueNote];
      setMessages(history);
      messagesRef.current = history;
    }

    await runAssistantTurn(history, opts);
  }, [isAssistantTurnActive, runAssistantTurn]);

  // Retry a failed action card's generation via the dedicated endpoint — no turn
  // re-run. Card goes loading → ready (payload) on success, back to error on
  // failure. See dev-docs/ai-retry-and-failure-recovery-plan.md §6.
  const retryFailedAction = React.useCallback(
    async (messageId: string) => {
      const target = messagesRef.current.find((m) => m.id === messageId);
      const action = target?.action;
      if (
        !action ||
        action.state !== "error" ||
        !action.input ||
        !action.chatMessageId
      ) {
        return;
      }

      const setActionState = (next: PendingAction) => {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === messageId ? { ...m, action: next } : m,
          );
          messagesRef.current = updated;
          return updated;
        });
      };

      setActionState({ ...action, state: "loading", error: undefined });

      try {
        const res = await fetch("/api/multimodal/action-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            submissionId,
            questionOrder: question.order,
            questionId: question.id,
            sessionId,
            actionId: action.id,
            input: action.input,
            chatMessageId: action.chatMessageId,
            language,
            ...(supportEnabled && supportLanguage
              ? { supportLanguage }
              : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          payload?: ActionPayload;
          error?: string;
          code?: AiErrorCode;
          retryable?: boolean;
          retryAfterMs?: number;
        };
        if (!res.ok || !data.payload) {
          setActionState({
            ...action,
            state: "error",
            error: {
              code: data.code ?? "UNKNOWN",
              message: data.error || "Retry failed — please try again.",
              retryable: data.retryable ?? true,
              ...(data.retryAfterMs ? { retryAfterMs: data.retryAfterMs } : {}),
            },
          });
          return;
        }
        setActionState({
          ...action,
          state: "ready",
          payload: data.payload,
          error: undefined,
        });
      } catch (err) {
        setActionState({
          ...action,
          state: "error",
          error: {
            code: "NETWORK",
            message:
              err instanceof Error ? err.message : "Retry failed — please try again.",
            retryable: true,
          },
        });
      }
    },
    [
      assignmentId,
      submissionId,
      question.order,
      question.id,
      sessionId,
      language,
      supportEnabled,
      supportLanguage,
    ],
  );

  return (
    <div className="relative space-y-4">
      {!hasStarted ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-6">
          <p className="text-sm text-muted-foreground text-center">
            {audioInputEnabled ? (
              <>
                Begin the activity by clicking the button below and talk to the
                AI assistant.
                <br /> Wait for the assistant to start speaking.
                {textInputEnabled
                  ? " You can speak by clicking the microphone icon, or type your message."
                  : " You can speak by clicking the microphone icon."}
              </>
            ) : (
              <>
                Begin the activity by clicking the button below.
                <br /> Type your messages to the AI assistant to respond.
              </>
            )}
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

          {audioInputEnabled && micPermission !== "granted" ? (
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
              speechMode={speechMode}
              onRetryTurn={() => void retryFailedTurn()}
              onActionRetry={(messageId) => void retryFailedAction(messageId)}
              retryDisabled={isAssistantTurnActive}
              retryAttemptCount={turnRetryCount}
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
                ui.botExpanded && !textComposing ? "flex-[2]" : "flex-1",
              )}
            >
              <BotStatusPanel
                uiState={ui.uiState}
                focused={ui.botExpanded && !textComposing}
                showBotWave={ui.showBotWave}
                botWaveMode={ui.botWaveMode}
                playbackAnalyser={playback.playbackAnalyser}
                statusLabelOverride={isReconnecting ? "Reconnecting…" : undefined}
              />
            </div>
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                ui.userExpanded || textComposing ? "flex-[2]" : "flex-1",
              )}
            >
              <UserInputPanel
                ui={ui}
                canSend={recorder.isRecording && !isTranscribing}
                recorder={recorder}
                onMicPress={() => void handleMicPress()}
                onSend={() => void handleMicPress()}
                audioEnabled={audioInputEnabled}
                textEnabled={textInputEnabled}
                textValue={textDraft}
                onTextChange={setTextDraft}
                onTextSubmit={() => void handleTextSubmit()}
                canSubmitText={canSubmitText}
                inputsDisabled={!hasBotStarted}
                expanded={ui.userExpanded || textComposing}
                onComposingChange={setTextComposing}
                allowCopyPaste={allowCopyPaste}
                submissionId={submissionId}
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
