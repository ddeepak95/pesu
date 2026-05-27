"use client";

import { useCallback, useEffect, useState } from "react";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ActionButtonRings } from "./ActionButtonRings";
import { AudioWaveform } from "./AudioWaveform";
import { getKonvoPanelCardClass, type KonvoUiConfig } from "./uiState";
import type { UseAudioRecorderResult } from "./useAudioRecorder";
import { useRecordingVoiceIdle } from "./useRecordingVoiceIdle";

const MIC_NUDGE_DELAY_MS = 4000;

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

  const isListeningForMic =
    ui.uiState === "user_listening" &&
    ui.actionButton === "mic" &&
    !micDisabled;

  const isRecording =
    ui.uiState === "user_speaking" &&
    recorder.isRecording &&
    Boolean(recorder.analyser);

  const showSendNudge = useRecordingVoiceIdle(isRecording, recorder.analyser);
  const showMicNudge = useDelayedFlag(isListeningForMic, MIC_NUDGE_DELAY_MS);
  const [micNudgeDismissed, setMicNudgeDismissed] = useState(false);

  useEffect(() => {
    if (!isListeningForMic) return;
    return () => setMicNudgeDismissed(false);
  }, [isListeningForMic]);

  const showMicNudgeRings =
    isListeningForMic && showMicNudge && !micNudgeDismissed;

  const handleMicPress = useCallback(() => {
    setMicNudgeDismissed(true);
    onMicPress();
  }, [onMicPress]);

  const showRings = ui.actionButton === "send" ? showSendNudge : showMicNudgeRings;
  const ringClassName =
    ui.actionButton === "send" ? "border-foreground" : "border-foreground";

  return (
    <Card
      className={cn(
        "relative h-full min-h-[140px] p-4",
        getKonvoPanelCardClass(ui.userExpanded),
        micDisabled && "opacity-60",
      )}
    >
      <div className="absolute top-4 left-4 z-10">
        <p className="font-semibold text-foreground">You</p>
      </div>

      <div className="absolute inset-0 flex items-center gap-4 px-4">
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center min-h-[56px] px-2">
          {ui.showUserWave ? (
            <>
              <AudioWaveform
                key={`rec-${recorder.recordingSessionId}`}
                mode={recorder.analyser ? "audio" : "thinking"}
                analyser={recorder.analyser}
                active={recorder.isRecording && Boolean(recorder.analyser)}
                className="w-full text-foreground"
              />
            </>
          ) : ui.showUserSpeakPrompt ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Tap the mic and speak when you&apos;re ready.
            </p>
          ) : (
            <div className="w-full h-14" aria-hidden />
          )}
        </div>

        <div className="relative shrink-0 size-14 overflow-visible">
          {ui.actionButton === "send" ? (
            <Button
              type="button"
              variant="default"
              className="absolute inset-0 z-10 size-full rounded-xl p-0 [&_svg]:size-6"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send"
            >
              <Send className="h-6 w-6" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              className="absolute inset-0 z-10 size-full rounded-xl p-0 [&_svg]:size-6"
              onClick={handleMicPress}
              disabled={micDisabled}
              aria-label="Record"
            >
              <Mic className="h-6 w-6" />
            </Button>
          )}
          <ActionButtonRings active={showRings} ringClassName={ringClassName} />
        </div>
      </div>

      {recorder.error ? (
        <p className="absolute bottom-4 left-4 right-4 z-10 text-xs text-destructive">
          {recorder.error}
        </p>
      ) : null}
    </Card>
  );
}
