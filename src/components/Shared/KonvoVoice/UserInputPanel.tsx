"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePasteGuard } from "@/components/Shared/AssessmentInputs/usePasteGuard";
import { AudioWaveform } from "./AudioWaveform";
import { getKonvoPanelCardClass, type KonvoUiConfig } from "./uiState";
import type { UseAudioRecorderResult } from "./useAudioRecorder";

interface UserInputPanelProps {
  ui: KonvoUiConfig;
  canSend: boolean;
  recorder: UseAudioRecorderResult;
  onMicPress: () => void;
  onSend: () => void;
  /** Whether the mic (audio input) is offered at all. */
  audioEnabled: boolean;
  /** Whether the text box (text input) is offered at all. */
  textEnabled: boolean;
  /** Current text draft. */
  textValue: string;
  onTextChange: (value: string) => void;
  onTextSubmit: () => void;
  /** Whether the learner may submit text right now (false during bot thinking). */
  canSubmitText: boolean;
  /**
   * When true, the text box and mic are disabled entirely (e.g. before the
   * tutor's first message has started).
   */
  inputsDisabled?: boolean;
  /**
   * Whether the panel is expanded (the learner's turn OR they're composing text).
   * Drives the card surface. Defaults to `ui.userExpanded`.
   */
  expanded?: boolean;
  /**
   * Fired when the learner starts/stops composing text (focus or a non-empty
   * draft) so the parent can expand this panel over the bot panel even mid-turn.
   */
  onComposingChange?: (composing: boolean) => void;
  allowCopyPaste?: boolean;
  submissionId?: string;
  /** Optional control rendered directly above the mic button (e.g. STT language toggle). */
  micAccessory?: ReactNode;
}

export function UserInputPanel({
  ui,
  canSend,
  recorder,
  onMicPress,
  onSend,
  audioEnabled,
  textEnabled,
  textValue,
  onTextChange,
  onTextSubmit,
  canSubmitText,
  inputsDisabled,
  expanded,
  onComposingChange,
  allowCopyPaste,
  submissionId,
  micAccessory,
}: UserInputPanelProps) {
  const micDisabled =
    inputsDisabled || (ui.actionButton === "mic" && !ui.micEnabled);

  const [textFocused, setTextFocused] = useState(false);
  const textHasInput = textEnabled && textValue.trim().length > 0;
  // "Composing" = focused or holding a draft — keeps the panel expanded and the
  // action button in Send mode even while the tutor is still speaking.
  const composing = textEnabled && (textFocused || textHasInput);

  useEffect(() => {
    onComposingChange?.(composing);
  }, [composing, onComposingChange]);

  const panelExpanded = expanded ?? ui.userExpanded;

  // Show the text box whenever text is enabled and we're not mid-recording
  // (recording shows the waveform). It's compact while contracted, full-height
  // once the panel expands.
  const showTextBox = textEnabled && !ui.showUserWave;

  // Right-hand action button: Send the typed message when there's a draft,
  // otherwise the mic (record / stop) when audio is enabled.
  const actionButtonMode: "text-send" | "record-send" | "mic" | "none" =
    textHasInput
      ? "text-send"
      : ui.showUserWave
        ? "record-send"
        : audioEnabled
          ? "mic"
          : "none";

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const guards = usePasteGuard({
    allowCopyPaste,
    submissionId,
    onValueChange: onTextChange,
    onSubmit: onTextSubmit,
    textareaRef,
  });

  return (
    <Card
      className={cn(
        "relative h-full min-h-[140px] p-4",
        getKonvoPanelCardClass(panelExpanded),
        micDisabled && !showTextBox && "opacity-60",
      )}
    >
      <div className="absolute top-4 left-4 z-10">
        <p className="font-semibold text-foreground">You</p>
      </div>

      <div className="absolute inset-0 flex items-stretch gap-3 px-4 pt-11 pb-3">
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center">
          {ui.showUserWave ? (
            <AudioWaveform
              key={`rec-${recorder.recordingSessionId}`}
              mode={recorder.analyser ? "audio" : "thinking"}
              analyser={recorder.analyser}
              active={recorder.isRecording && Boolean(recorder.analyser)}
              className="w-full text-foreground"
            />
          ) : showTextBox ? (
            <div className="relative w-full flex-1 min-h-0">
              <Textarea
                ref={textareaRef}
                value={textValue}
                onChange={guards.onChange}
                onKeyDown={guards.onKeyDown}
                onPaste={guards.onPaste}
                onDrop={guards.onDrop}
                onContextMenu={guards.onContextMenu}
                onFocus={() => setTextFocused(true)}
                onBlur={() => setTextFocused(false)}
                disabled={inputsDisabled}
                placeholder={inputsDisabled ? "Waiting for the tutor…" : "Tap to type…"}
                className="resize-none h-full w-full text-left"
              />
            </div>
          ) : ui.showUserSpeakPrompt && audioEnabled ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Tap the mic and speak when you&apos;re ready.
            </p>
          ) : (
            <div className="w-full h-14" aria-hidden />
          )}
        </div>

        {actionButtonMode !== "none" ? (
          <div className="relative shrink-0 self-center flex flex-col items-center gap-2">
            {micAccessory}
            <div className="relative size-14 overflow-visible">
              {actionButtonMode === "text-send" ? (
                <Button
                  type="button"
                  variant="default"
                  className="absolute inset-0 z-10 size-full rounded-xl p-0 [&_svg]:size-6"
                  onClick={onTextSubmit}
                  disabled={!canSubmitText || inputsDisabled}
                  aria-label="Send"
                >
                  <Send className="h-6 w-6" />
                </Button>
              ) : actionButtonMode === "record-send" ? (
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
                  onClick={onMicPress}
                  disabled={micDisabled}
                  aria-label="Record"
                >
                  <Mic className="h-6 w-6" />
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {recorder.error ? (
        <p className="absolute bottom-4 left-4 right-4 z-10 text-xs text-destructive">
          {recorder.error}
        </p>
      ) : null}
    </Card>
  );
}
