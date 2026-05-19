"use client";

import Image from "next/image";
import { AudioWaveform } from "./AudioWaveform";
import {
  type BotVisualState,
  type KonvoUiState,
  uiStateToBotVisual,
} from "./uiState";

function getAvatarImage(state: BotVisualState): string {
  switch (state) {
    case "thinking":
      return "/speaking_avatars/thinking.png";
    case "speaking":
      return "/speaking_avatars/speaking.png";
    case "ready":
      return "/speaking_avatars/ready.png";
    default:
      return "/speaking_avatars/listening.png";
  }
}

function getRingConfig(state: BotVisualState) {
  switch (state) {
    case "thinking":
      return { animationClass: "animate-ring-spin", color: "border-purple-600" };
    case "speaking":
      return { animationClass: "animate-ring-ripple", color: "border-indigo-600" };
    case "ready":
      return { animationClass: "animate-ring-breathe", color: "border-emerald-600" };
    default:
      return { animationClass: "animate-ring-pulse", color: "border-blue-600" };
  }
}

function getStatusLabel(state: BotVisualState): string {
  switch (state) {
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "ready":
      return "Your turn";
    default:
      return "Listening";
  }
}

interface BotStatusPanelProps {
  uiState: KonvoUiState;
  showBotWave: boolean;
  botWaveMode: "thinking" | "audio" | "none";
  playbackAnalyser: AnalyserNode | null;
}

export function BotStatusPanel({
  uiState,
  showBotWave,
  botWaveMode,
  playbackAnalyser,
}: BotStatusPanelProps) {
  const botState = uiStateToBotVisual(uiState);
  const ring = getRingConfig(botState);
  const label = getStatusLabel(botState);

  return (
    <div className="flex flex-col h-full min-h-[140px] rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-semibold text-foreground">Konvo Bot</span>
        <span className="text-sm italic text-muted-foreground">{label}</span>
      </div>

      <div className="flex flex-1 items-center gap-4 min-h-0">
        <div className="relative shrink-0 w-20 h-20 flex items-center justify-center">
          <div
            className={`absolute inset-0 m-auto rounded-full ${ring.color} ${ring.animationClass}`}
            style={{ width: 80, height: 80, borderWidth: 2 }}
          />
          <div
            className={`relative w-16 h-16 rounded-full overflow-hidden border-2 ${ring.color}`}
          >
            <Image
              src={getAvatarImage(botState)}
              alt={`Konvo ${label}`}
              fill
              className="object-cover"
              style={{ transform: "scale(1.5) translateY(4px)" }}
              sizes="64px"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-center h-14">
          {showBotWave ? (
            <AudioWaveform
              mode={botWaveMode}
              analyser={playbackAnalyser}
              active={botWaveMode === "audio" && Boolean(playbackAnalyser)}
              className="w-full"
            />
          ) : (
            <div className="w-full h-14" />
          )}
        </div>
      </div>
    </div>
  );
}
