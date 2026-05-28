"use client";

import Image from "next/image";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "./AudioWaveform";
import {
  type BotVisualState,
  type KonvoUiState,
  getKonvoPanelCardClass,
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
  focused: boolean;
  showBotWave: boolean;
  botWaveMode: "thinking" | "audio" | "none";
  playbackAnalyser: AnalyserNode | null;
}

export function BotStatusPanel({
  uiState,
  focused,
  showBotWave,
  botWaveMode,
  playbackAnalyser,
}: BotStatusPanelProps) {
  const botState = uiStateToBotVisual(uiState);
  const label = getStatusLabel(botState);

  return (
    <Card
      className={cn(
        "flex flex-col h-full min-h-[140px] p-4",
        getKonvoPanelCardClass(focused),
      )}
    >
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-semibold text-foreground">Konvo Bot</span>
        <span className="text-xs italic text-muted-foreground">{label}</span>
      </div>

      <div className="flex flex-1 items-center gap-4 min-h-0">
        <div className="relative shrink-0 w-20 h-20 flex items-center justify-center">
          <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-border bg-canvas">
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
              className="w-full text-foreground"
            />
          ) : (
            <div className="w-full h-14" />
          )}
        </div>
      </div>
    </Card>
  );
}
