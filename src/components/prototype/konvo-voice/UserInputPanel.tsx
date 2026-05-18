"use client";

import { Loader2, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatPhase } from "./useTurnBasedVoiceChat";
import { AudioWaveform } from "./AudioWaveform";
import type { UseAudioRecorderResult } from "./useAudioRecorder";

interface UserInputPanelProps {
  phase: ChatPhase;
  disabled: boolean;
  canSend: boolean;
  isTranscribing: boolean;
  recorder: UseAudioRecorderResult;
  onTapToSpeak: () => void;
  onSend: () => void;
}

export function UserInputPanel({
  phase,
  disabled,
  canSend,
  isTranscribing,
  recorder,
  onTapToSpeak,
  onSend,
}: UserInputPanelProps) {
  const isRecording = phase === "user_recording";
  const showTapToSpeak = phase === "user_idle";

  return (
    <div className={`flex flex-col h-full min-h-[140px] rounded-xl border border-border bg-muted/40 p-4 ${
        disabled ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <p className="text-sm font-semibold text-foreground mb-3">
        {showTapToSpeak ? "Tap to Speak" : "Your Response"}
      </p>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0 w-full">
        {showTapToSpeak ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-24 w-24 rounded-xl flex flex-col gap-2"
            onClick={onTapToSpeak}
            disabled={disabled}
          >
            <Mic className="h-10 w-10" />
          </Button>
        ) : (
          <div className="flex w-full flex-col gap-3 flex-1 min-h-0 justify-center">
            <div className="w-full px-1">
              <AudioWaveform
                analyser={recorder.analyser}
                active={isRecording && !isTranscribing}
              />
            </div>

            <div className="flex w-full items-center justify-end gap-2">
              {isTranscribing ? (
                <p className="flex-1 text-sm text-muted-foreground italic flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Transcribing…
                </p>
              ) : (
                <p className="flex-1 text-sm text-muted-foreground italic">
                  {isRecording ? "Speak, then send" : "…"}
                </p>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                className="flex flex-col h-auto py-2 px-3 gap-1 shrink-0"
                onClick={onSend}
                disabled={!canSend}
              >
                <Send className="h-5 w-5" />
                <span className="text-xs">Send</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {recorder.error ? (
        <p className="text-xs text-destructive mt-2">{recorder.error}</p>
      ) : null}
    </div>
  );
}
