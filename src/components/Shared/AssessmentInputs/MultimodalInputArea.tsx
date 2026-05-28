"use client";

import React from "react";
import { Loader2, Play } from "lucide-react";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useMultimodalSpeechModels } from "@/hooks/swr/useMultimodalSpeechModels";
import { Button } from "@/components/ui/button";
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
  | { type: "end_conversation"; reason: "thorough" | "refusal" }
  | { type: "speech_start"; index?: number; sampleRate?: number }
  | { type: "speech_chunk"; index?: number; base64: string }
  | { type: "speech_end"; index?: number }
  | { type: "done" }
  | { type: "error"; error?: string; message?: string };

function formatFullStudentTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "student" && m.content.trim())
    .map((m) => m.content.trim())
    .join("\n\n");
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
  isEvaluating,
  onSubmitForEvaluation,
  onLanguageDisabledChange,
  onNavigationDisabledChange,
  onVoiceMicPermissionRequestPendingChange,
  onIntegrityAccessRevoked,
  fileSubmissionsContent,
  activityType = "learning",
  title,
  studentInstructions,
  maxAttempts,
  sharedContext,
  botPromptConfig,
}: AssessmentInputProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [expandedMessageIds, setExpandedMessageIds] = React.useState<
    Record<string, boolean>
  >({});
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
  });

  const { data: speechModels } = useMultimodalSpeechModels(assignmentId);
  const recorder = useAudioRecorder();
  const playback = useStreamingSpeechPlayback();
  const { state: micPermission, requestAccess } = useMicrophonePermission();
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const userOrdinalRef = React.useRef(0);
  const botOrdinalRef = React.useRef(0);
  const botInterruptionRequestedRef = React.useRef(false);
  const assistantTurnSeqRef = React.useRef(0);
  const activeAbortRef = React.useRef<AbortController | null>(null);
  const activeAssistantTurnRef = React.useRef({
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
      formData.append("attemptNumber", String(attempts.length + 1));
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
      attempts.length,
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
    }) => {
      try {
        const formData = new FormData();
        formData.append("submissionId", submissionId);
        formData.append("assignmentId", assignmentId);
        formData.append("questionOrder", String(question.order));
        formData.append("attemptNumber", String(attempts.length + 1));
        formData.append("utteranceOrdinal", String(input.ordinal));
        formData.append("dbRole", input.dbRole);
        formData.append("storageRole", input.storageRole);
        formData.append("interrupted", String(Boolean(input.interrupted)));
        formData.append("spokenAt", new Date().toISOString());
        formData.append("content", input.content);
        if (input.generatedContent) {
          formData.append("generatedContent", input.generatedContent);
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
        await fetch("/api/multimodal/audio/utterance", {
          method: "POST",
          body: formData,
        });
        await flushSessionChunk(input.audioBlob);
      } catch (utteranceError) {
        console.error("Failed to persist utterance audio", utteranceError);
      }
    },
    [
      assignmentId,
      attempts.length,
      flushSessionChunk,
      question.order,
      submissionId,
    ],
  );

  const finishSubmission = React.useCallback(async () => {
    const answerText = formatFullStudentTranscript(messagesRef.current).trim();
    await onSubmitForEvaluation(answerText);
  }, [onSubmitForEvaluation]);

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
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: content || "...",
      };
      setMessages((prev) => {
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
          (m) => m.role === "student" && (m.content?.trim() ?? "") !== "",
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
      playback.releasePlayback();
    },
    [playback],
  );

  const runAssistantTurn = React.useCallback(
    async (history: ChatMessage[]) => {
      const turnId = ++assistantTurnSeqRef.current;
      setIsAssistantTurnActive(true);
      setIsThinking(true);
      setIsSpeaking(false);
      setError(null);
      botInterruptionRequestedRef.current = false;

      const ttsModelId =
        speechModels?.ttsModelId ?? DEFAULT_KONVO_SESSION_CONFIG.ttsModelId;
      const attemptNumber = attempts.length + 1;
      let sampleRate = 24000;
      let ttsStarted = false;
      let interrupted = false;
      const pcmChunks: Uint8Array[] = [];
      let speechSegmentPrepared = false;
      let speechSegmentEnded = false;
      let assistantText = "";
      let didEndConversation = false;

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

      try {
        const response = await fetch("/api/multimodal/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            submissionId,
            questionOrder: question.order,
            attemptNumber,
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            system_prompt: systemPrompt,
            greeting,
            language,
            ttsModelId,
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
          } else if (event.type === "end_conversation") {
            didEndConversation = true;
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
          });
        }
        if (didEndConversation) {
          scheduleAutoFinish();
        }
      } catch (turnError) {
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
      assignmentId,
      attempts.length,
      greeting,
      language,
      onIntegrityAccessRevoked,
      playback,
      persistUtteranceAudio,
      question.order,
      releaseAssistantTurnUi,
      scheduleAutoFinish,
      commitAssistantTurnToMessages,
      speechModels?.ttsModelId,
      submissionId,
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
  }, [isStarting, maxAttemptsReached, runAssistantTurn]);

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
        const studentMessage: ChatMessage = {
          id: pendingMessageId,
          role: "student",
          content: text,
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingMessageId ? studentMessage : m)),
        );
        const nextHistory = historyWithPending.map((m) =>
          m.id === pendingMessageId ? studentMessage : m,
        );
        messagesRef.current = nextHistory;
        userOrdinalRef.current += 1;
        await persistUtteranceAudio({
          dbRole: "student",
          storageRole: "user",
          ordinal: userOrdinalRef.current,
          audioBlob: wavBlob,
          content: text,
        });
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
    language,
    maxAttemptsReached,
    persistUtteranceAudio,
    playback,
    recorder,
    commitAssistantTurnToMessages,
    releaseAssistantTurnUi,
    runAssistantTurn,
    speechModels?.sttModelId,
    speechModels?.ttsModelId,
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
          />
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
