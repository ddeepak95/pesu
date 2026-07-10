"use client";

import React from "react";
import { pcmToWavArrayBuffer } from "@/lib/konvo-voice/speech/audioBufferToWav";
import type { TtsConfig } from "./ActionCard";

/**
 * On-demand (tap-to-hear) TTS playback for a piece of text. Synthesizes via
 * `/api/multimodal/tts`, wrapping raw PCM in a WAV container so it's playable,
 * then plays it. Used by the `on_demand` speech-output mode (per-message play
 * button) and the suggested-response card. Each call re-synthesizes — this is a
 * lightweight, non-persisted playback (see plan §4c for the persisted variant).
 */
export function useOnDemandTts(ttsConfig?: TtsConfig) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const stop = React.useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const play = React.useCallback(
    async (text: string) => {
      if (!ttsConfig || !text.trim()) return;

      if (audioRef.current && !audioRef.current.paused) {
        stop();
        return;
      }

      setError(false);
      try {
        const res = await fetch("/api/multimodal/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ttsModelId: ttsConfig.ttsModelId,
            text,
            language: ttsConfig.language,
            assignmentId: ttsConfig.assignmentId,
          }),
        });

        if (!res.ok || !res.body) {
          setError(true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const chunks: Uint8Array[] = [];
        let mimeType = "audio/mpeg";
        let sampleRate = 24000;
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (event.type === "speech_start") {
                if (typeof event.mimeType === "string") mimeType = event.mimeType;
                if (typeof event.sampleRate === "number")
                  sampleRate = event.sampleRate;
              }
              if (
                event.type === "speech_chunk" &&
                typeof event.base64 === "string"
              ) {
                const raw = atob(event.base64);
                const bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                chunks.push(bytes);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        // Raw PCM (e.g. audio/L16) is not playable directly — wrap in WAV.
        let blob: Blob;
        const isPcm =
          mimeType.toLowerCase().includes("l16") ||
          mimeType.toLowerCase().includes("pcm");
        if (isPcm && chunks.length > 0) {
          const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
          const pcmBytes = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            pcmBytes.set(chunk, offset);
            offset += chunk.length;
          }
          blob = new Blob([pcmToWavArrayBuffer(pcmBytes, sampleRate)], {
            type: "audio/wav",
          });
        } else {
          blob = new Blob(chunks as BlobPart[], { type: mimeType });
        }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        setIsPlaying(true);
        void audio.play();
      } catch {
        setError(true);
        setIsPlaying(false);
      }
    },
    [ttsConfig, stop],
  );

  return { isPlaying, error, play, stop };
}
