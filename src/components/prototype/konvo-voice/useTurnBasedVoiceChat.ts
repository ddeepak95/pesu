"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotSegment, ContentKind } from "@/lib/prototype/konvo-voice/schema";
import { postJsonSse } from "./useSseClient";
import { useAudioRecorder } from "./useAudioRecorder";
import { useStreamingSpeechPlayback } from "./useStreamingSpeechPlayback";
import type { KonvoSessionConfig } from "@/lib/prototype/konvo-voice/sessionConfig";
import { getKonvoUiConfig } from "./uiState";

export interface KonvoVoiceChatParams {
  sessionConfig: KonvoSessionConfig;
  systemPrompt: string;
  greeting: string;
}

export type ChatPhase =
  | "not_started"
  | "bot_thinking"
  | "bot_speaking"
  | "user_idle"
  | "user_recording"
  | "user_submitting";

export interface ContentDisplay {
  kind: ContentKind;
  title: string;
  description?: string;
  url?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function useTurnBasedVoiceChat({
  sessionConfig,
  systemPrompt,
  greeting,
}: KonvoVoiceChatParams) {
  const [phase, setPhase] = useState<ChatPhase>("not_started");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState<ContentDisplay | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebugTranscript, setShowDebugTranscript] = useState(false);

  const turnAbortRef = useRef<AbortController | null>(null);
  const interruptedRef = useRef(false);
  const phaseRef = useRef<ChatPhase>(phase);
  phaseRef.current = phase;

  const recorder = useAudioRecorder();
  const playback = useStreamingSpeechPlayback();

  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const ui = useMemo(
    () => getKonvoUiConfig(phase, isTranscribing),
    [phase, isTranscribing],
  );

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string> => {
    const mime = blob.type || "audio/webm";
    const ext = mime.includes("mp4") || mime.includes("m4a")
      ? "recording.mp4"
      : mime.includes("ogg")
        ? "recording.ogg"
        : "recording.webm";

    const formData = new FormData();
    formData.append(
      "audio",
      new File([blob], ext, { type: mime }),
    );
    formData.append("sessionConfig", JSON.stringify(sessionConfig));

    const response = await fetch("/api/prototype/konvo-voice/transcribe", {
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

    return (body.text ?? "").trim();
  }, [sessionConfig]);

  const runTurn = useCallback(
    async (history: ChatMessage[], init?: boolean) => {
      turnAbortRef.current?.abort();
      interruptedRef.current = false;
      const ac = new AbortController();
      turnAbortRef.current = ac;

      setError(null);
      setPhase("bot_thinking");
      playback.beginTurn({
        onPlaybackStart: () => {
          if (
            !interruptedRef.current &&
            phaseRef.current === "bot_thinking"
          ) {
            setPhase("bot_speaking");
          }
        },
      });

      let assistantText = "";
      let streamError: Error | null = null;

      try {
        await postJsonSse(
          "/api/prototype/konvo-voice/turn",
          {
            messages: history,
            init,
            system_prompt: systemPrompt,
            greeting,
            sessionConfig,
          },
          (event) => {
            const type = event.type as string;

            if (type === "thinking") {
              setPhase("bot_thinking");
            } else if (type === "content" && event.segment) {
              const seg = event.segment as BotSegment;
              if (seg.type === "content") {
                setContent({
                  kind: seg.kind,
                  title: seg.title,
                  description: seg.description,
                  url: seg.url,
                });
              }
            } else if (type === "speech_start") {
              playback.prepareSegment(event.index as number, {
                sampleRate:
                  typeof event.sampleRate === "number"
                    ? event.sampleRate
                    : undefined,
              });
            } else if (type === "speech_chunk") {
              playback.appendChunk(
                event.index as number,
                event.base64 as string,
              );
            } else if (type === "speech_end") {
              void playback.endSegment(event.index as number, {
                onSegmentEnd: () => {},
              });
            } else if (type === "assistant_text") {
              assistantText = (event.text as string) ?? "";
            } else if (type === "done") {
              if (!interruptedRef.current) {
                // Stay in bot_speaking until all queued TTS segments finish playing.
                void playback.waitForAll({
                  onAllEnd: () => {
                    if (!interruptedRef.current) {
                      playback.releasePlayback();
                      setPhase("user_idle");
                    }
                  },
                });
              }
            } else if (type === "error") {
              streamError = new Error(
                (event.message as string) ?? "Turn failed",
              );
            }
          },
          ac.signal,
        );

        if (streamError) {
          throw streamError;
        }

        if (assistantText.trim() && !interruptedRef.current) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantText.trim() },
          ]);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (interruptedRef.current) return;
        setError(e instanceof Error ? e.message : "Turn failed");
        setPhase("user_idle");
      }
    },
    [playback, sessionConfig, systemPrompt, greeting],
  );

  useEffect(() => {
    return () => {
      turnAbortRef.current?.abort();
    };
  }, []);

  const handleStart = useCallback(() => {
    if (phase !== "not_started") return;
    void runTurn([], true);
  }, [phase, runTurn]);

  const startUserRecording = useCallback(async () => {
    setError(null);
    recorderRef.current.clearRecording();
    setTranscript("");

    // Free the output device after bot TTS before opening the mic.
    playback.releasePlayback();

    setPhase("user_recording");

    const started = await recorderRef.current.startRecording();
    if (started) {
      // phase already user_recording
    } else {
      setPhase("user_idle");
      const micError = recorderRef.current.error;
      if (micError) setError(micError);
    }
  }, [playback]);

  const handleMicPress = useCallback(async () => {
    // Unlock AudioContext in the same user-gesture turn (before any await).
    recorderRef.current.primeAudio();

    const currentPhase = phaseRef.current;
    if (currentPhase === "user_recording") return;

    if (currentPhase === "bot_speaking") {
      interruptedRef.current = true;
      playback.reset();
      turnAbortRef.current?.abort();
      await startUserRecording();
      return;
    }
    if (currentPhase === "user_idle") {
      await startUserRecording();
    }
  }, [playback, startUserRecording]);

  const handleSend = useCallback(async () => {
    if (phaseRef.current !== "user_recording" || isTranscribing) return;

    setError(null);

    try {
      const blob = await recorderRef.current.stopRecording();
      if (!blob || blob.size === 0) {
        setError("No audio recorded. Hold the mic longer and try again.");
        setPhase("user_idle");
        return;
      }

      if (blob.size < 2000) {
        setError(
          "Recording too short or silent. Speak for at least 1–2 seconds, then send.",
        );
        setPhase("user_idle");
        return;
      }

      setIsTranscribing(true);
      setPhase("user_submitting");

      const text = await transcribeBlob(blob);
      setTranscript(text);

      if (!text) {
        setError(
          "No speech detected in the recording. Speak louder, wait 1–2 seconds, then send again.",
        );
        setPhase("user_idle");
        return;
      }

      const userMessage: ChatMessage = { role: "user", content: text };
      const nextHistory = [...messages, userMessage];
      setMessages(nextHistory);
      setTranscript("");
      recorderRef.current.clearRecording();
      await runTurn(nextHistory);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setPhase("user_idle");
    } finally {
      setIsTranscribing(false);
    }
  }, [isTranscribing, messages, transcribeBlob, runTurn]);

  const isStarted = phase !== "not_started";
  const canSend = phase === "user_recording" && !isTranscribing;

  const userPanelDisabled = phase === "not_started";

  return {
    phase,
    ui,
    isStarted,
    content,
    transcript,
    isTranscribing,
    error,
    recorder,
    playbackAnalyser: playback.playbackAnalyser,
    showDebugTranscript,
    setShowDebugTranscript,
    handleStart,
    handleMicPress,
    handleSend,
    canSend,
    userPanelDisabled,
    messages,
  };
}
