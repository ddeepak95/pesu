"use client";

import { Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioWaveform } from "./AudioWaveform";
import type { KonvoUiConfig } from "./uiState";
import type { UseAudioRecorderResult } from "./useAudioRecorder";

interface UserInputPanelProps {
  ui: KonvoUiConfig;
  canSend: boolean;
  recorder: UseAudioRecorderResult;
  onMicPress: () => void;
  onSend: () => void;
}

export function UserInputPanel({
  ui,
  canSend,
  recorder,
  onMicPress,
  onSend,
}: UserInputPanelProps) {
  const micDisabled = ui.actionButton === "mic" && !ui.micEnabled;

  return (
    <div
      className={`flex flex-col h-full min-h-[140px] rounded-xl border border-border bg-muted/40 p-4 ${
        micDisabled ? "opacity-60" : ""
      }`}
    >
      <p className="text-sm font-semibold text-foreground mb-3">Your Response</p>

      <div className="flex flex-1 flex-col min-h-0 gap-3">
        {ui.showUserSpeakPrompt ? (
          <p className="text-sm text-muted-foreground text-center px-2">
            Tap the mic and speak when you&apos;re ready.
          </p>
        ) : null}

        {ui.showUserWave ? (
          <div className="w-full px-1 flex-1 flex flex-col items-center justify-center min-h-[48px] gap-1">
            <p className="text-xs text-muted-foreground">
              {recorder.isRecording ? "Recording… speak now" : "Starting mic…"}
            </p>
            <AudioWaveform
              key={`rec-${recorder.recordingSessionId}`}
              mode={recorder.analyser ? "audio" : "thinking"}
              analyser={recorder.analyser}
              active={recorder.isRecording && Boolean(recorder.analyser)}
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex-1 min-h-[48px]" />
        )}

        <div className="flex w-full items-center justify-end">
          {ui.actionButton === "send" ? (
            <Button
              type="button"
              variant="default"
              size="lg"
              className="h-14 w-14 rounded-xl shrink-0"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send"
            >
              <Send className="h-6 w-6" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-14 w-14 rounded-xl shrink-0"
              onClick={onMicPress}
              disabled={micDisabled}
              aria-label="Record"
            >
              <Mic className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>

      {recorder.error ? (
        <p className="text-xs text-destructive mt-2">{recorder.error}</p>
      ) : null}
    </div>
  );
}
