"use client";

import Image from "next/image";
import type { ChatPhase } from "./useTurnBasedVoiceChat";
import { AudioWaveform } from "./AudioWaveform";

type BotVisualState = "thinking" | "speaking" | "listening";

function phaseToBotState(phase: ChatPhase): BotVisualState {
  if (phase === "bot_thinking" || phase === "user_submitting") return "thinking";
  if (phase === "bot_speaking") return "speaking";
  return "listening";
}

function getAvatarImage(state: BotVisualState): string {
  switch (state) {
    case "thinking":
      return "/speaking_avatars/thinking.png";
    case "speaking":
      return "/speaking_avatars/speaking.png";
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
    default:
      return "Listening";
  }
}

interface BotStatusPanelProps {
  phase: ChatPhase;
}

export function BotStatusPanel({ phase }: BotStatusPanelProps) {
  const botState = phaseToBotState(phase);
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
              style={{ transform: "scale(1.5) translateY(12px)" }}
              sizes="64px"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex items-center">
          {botState === "speaking" ? (
            <AudioWaveform active className="opacity-90" />
          ) : (
            <div className="w-full h-12" />
          )}
        </div>
      </div>
    </div>
  );
}
