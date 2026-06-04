"use client";

import React from "react";
import { Pause, Play } from "lucide-react";
import { pcmToWavArrayBuffer } from "@/lib/konvo-voice/speech/audioBufferToWav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { SuggestedResponseActionPayload } from "@/lib/multimodal/actions/types";
import type { TtsConfig } from "../ActionCard";

export interface SuggestedResponseCardProps {
  payload: SuggestedResponseActionPayload;
  ttsConfig?: TtsConfig;
}

export function SuggestedResponseCard({
  payload,
  ttsConfig,
}: SuggestedResponseCardProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [audioError, setAudioError] = React.useState(false);

  const handlePlay = React.useCallback(async () => {
    if (!ttsConfig) return;

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setAudioError(false);

    try {
      const res = await fetch("/api/multimodal/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttsModelId: ttsConfig.ttsModelId,
          text: payload.responseText,
          language: ttsConfig.language,
          assignmentId: ttsConfig.assignmentId,
        }),
      });

      if (!res.ok || !res.body) {
        setAudioError(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
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

      // Raw PCM (e.g. audio/L16) is not playable directly — wrap in a WAV container.
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
        blob = new Blob(chunks, { type: mimeType });
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
      setAudioError(true);
      setIsPlaying(false);
    }
  }, [ttsConfig, payload.responseText]);

  return (
    <div
      className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-2"
      aria-label="Suggested response"
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-amber-100/90 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Suggested Response
        </span>
        <InfoTooltip text="This is a sample response you could say. Try saying it out loud to practice!" />
      </div>
      <div className="flex items-center gap-3">
        {ttsConfig ? (
          <button
            type="button"
            onClick={() => void handlePlay()}
            aria-label={isPlaying ? "Pause" : "Play suggested response"}
            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground leading-snug">
            {payload.responseText}
          </p>
          {payload.transliteration ? (
            <p className="text-xs text-muted-foreground">
              {payload.transliteration}
            </p>
          ) : null}
          {payload.translation ? (
            <p className="text-xs text-muted-foreground italic">
              {payload.translation}
            </p>
          ) : null}
          {audioError ? (
            <p className="text-xs text-destructive">Could not load audio.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
