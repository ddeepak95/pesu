"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BotSegment, ContentKind } from "@/lib/prototype/konvo-voice/schema";
import { postJsonSse } from "./useSseClient";
import { useAudioRecorder } from "./useAudioRecorder";
import { useStreamingSpeechPlayback } from "./useStreamingSpeechPlayback";

export type ChatPhase =
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

export function useTurnBasedVoiceChat() {
  const [phase, setPhase] = useState<ChatPhase>("bot_thinking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState<ContentDisplay | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebugTranscript, setShowDebugTranscript] = useState(false);

  const turnAbortRef = useRef<AbortController | null>(null);

  const recorder = useAudioRecorder();
  const playback = useStreamingSpeechPlayback();

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    const response = await fetch("/api/prototype/konvo-voice/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };
      throw new Error(body.details ?? body.error ?? "Transcription failed");
    }

    const data = (await response.json()) as { text?: string };
    return (data.text ?? "").trim();
  }, []);

  const runTurn = useCallback(
    async (history: ChatMessage[], init?: boolean) => {
      turnAbortRef.current?.abort();
      const ac = new AbortController();
      turnAbortRef.current = ac;

      setError(null);
      setPhase("bot_thinking");
      playback.beginTurn();

      let assistantText = "";
      let streamError: Error | null = null;

      try {
        await postJsonSse(
          "/api/prototype/konvo-voice/turn",
          { messages: history, init },
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
              setPhase("bot_speaking");
              playback.setActiveIndex(event.index as number);
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
              setPhase("user_idle");
              void playback.waitForAll({
                onAllEnd: () => setPhase("user_idle"),
              });
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

        if (assistantText.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantText.trim() },
          ]);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Turn failed");
        setPhase("user_idle");
      }
    },
    [playback],
  );

  useEffect(() => {
    void runTurn([], true);
    return () => {
      turnAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTapToSpeak = useCallback(async () => {
    setError(null);
    recorder.clearRecording();
    setTranscript("");
    setPhase("user_recording");
    await recorder.startRecording();
  }, [recorder]);

  const handleSend = useCallback(async () => {
    if (phase !== "user_recording") return;

    setIsTranscribing(true);
    setError(null);

    try {
      const blob = await recorder.stopRecording();
      if (!blob || blob.size === 0) {
        setError("No audio recorded. Please try again.");
        setPhase("user_idle");
        return;
      }

      const text = await transcribeBlob(blob);
      setTranscript(text);

      if (!text) {
        setError("Could not transcribe your message. Please try again.");
        setPhase("user_idle");
        return;
      }

      const userMessage: ChatMessage = { role: "user", content: text };
      const nextHistory = [...messages, userMessage];
      setMessages(nextHistory);
      setTranscript("");
      recorder.clearRecording();
      setPhase("user_submitting");
      await runTurn(nextHistory);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setPhase("user_idle");
    } finally {
      setIsTranscribing(false);
    }
  }, [phase, messages, recorder, transcribeBlob, runTurn]);

  const canSend = phase === "user_recording" && !isTranscribing;

  const userPanelDisabled =
    phase === "bot_thinking" ||
    phase === "bot_speaking" ||
    phase === "user_submitting" ||
    isTranscribing;

  return {
    phase,
    content,
    transcript,
    isTranscribing,
    error,
    recorder,
    showDebugTranscript,
    setShowDebugTranscript,
    handleTapToSpeak,
    handleSend,
    canSend,
    userPanelDisabled,
    messages,
  };
}
