"use client";

import { Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type InputMode = "text" | "audio";
export type SpeechMode = "automatic" | "on_demand" | "none";

interface MultimodalInteractionEditorProps {
  /** Learner-facing input methods (at least one is always selected). */
  inputModes: InputMode[];
  onInputModesChange: (modes: InputMode[]) => void;
  /** When/whether the tutor's reply is spoken. */
  speechMode: SpeechMode;
  onSpeechModeChange: (mode: SpeechMode) => void;
  audioDelivery: "transcribe" | "direct";
  onAudioDeliveryChange: (audioDelivery: "transcribe" | "direct") => void;
  /**
   * Whether learner audio input is usable at all (STT available OR the chat
   * model takes audio directly). `undefined` while the capability check loads —
   * treated as unavailable until it resolves. Gates the "Voice" input method.
   */
  audioInputAvailable?: boolean;
  /**
   * Whether direct audio input is currently usable. Pass `true` when there's no
   * capability check to gate on (e.g. a template default). `undefined` while a
   * check is still loading. Gates the "Send audio directly" toggle.
   */
  audioInputSupported?: boolean;
  disabled?: boolean;
}

const SPEECH_MODE_OPTIONS: { value: SpeechMode; label: string; hint: string }[] =
  [
    {
      value: "automatic",
      label: "Auto-play voice",
      hint: "The tutor speaks every reply aloud automatically (with a waveform).",
    },
    {
      value: "on_demand",
      label: "Text with tap-to-hear",
      hint: "Replies show as text; the learner taps a button to hear any reply.",
    },
    {
      value: "none",
      label: "Text only",
      hint: "The tutor never speaks; replies are shown as text only.",
    },
  ];

export function MultimodalAudioInputEditor({
  inputModes,
  onInputModesChange,
  speechMode,
  onSpeechModeChange,
  audioDelivery,
  onAudioDeliveryChange,
  audioInputAvailable,
  audioInputSupported,
  disabled,
}: MultimodalInteractionEditorProps) {
  const audioUnavailable = audioInputAvailable !== true;
  const textSelected = inputModes.includes("text");
  // Reflect the saved/selected state regardless of capability, so edit mode
  // shows what's actually configured. Capability gates *interaction* (the
  // checkbox is disabled + locked when unavailable), not display — otherwise a
  // still-loading or unavailable capability check makes saved audio settings
  // look like they were reset.
  const audioSelected = inputModes.includes("audio");

  // Never allow unchecking the last remaining method.
  const textIsOnlySelected = textSelected && !audioSelected;
  const audioIsOnlySelected = audioSelected && !textSelected;

  const setMode = (mode: InputMode, on: boolean) => {
    const next = new Set(inputModes);
    if (on) next.add(mode);
    else next.delete(mode);
    // Guard: at least one method must remain.
    if (next.size === 0) return;
    // Preserve a stable order.
    onInputModesChange(
      (["text", "audio"] as InputMode[]).filter((m) => next.has(m)),
    );
  };

  const directEnabled = audioDelivery === "direct";
  const directCapabilityUnavailable = audioInputSupported !== true;

  return (
    <div className="space-y-6">
      {/* Input methods */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">Input methods</Label>
          <InfoTooltip text="Which ways the learner can respond. At least one must be enabled." />
        </div>

        <div className="flex space-x-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={textSelected}
              disabled={disabled || textIsOnlySelected}
              onCheckedChange={(on) => setMode("text", on === true)}
            />
            <span>Text</span>
          </label>
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={audioSelected}
                disabled={disabled || audioUnavailable || audioIsOnlySelected}
                onCheckedChange={(on) => setMode("audio", on === true)}
              />
              <span>Voice</span>
            </label>
            {audioUnavailable ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" aria-label="Unavailable" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {audioInputAvailable === undefined
                      ? "Checking whether this class supports voice input…"
                      : "This class has no speech-to-text model and its chat model can't take audio directly. Contact your administrator to enable voice input."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
      </div>

      {/* Output speech */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">Tutor speech</Label>
          <InfoTooltip text="Whether and when the tutor's replies are spoken aloud." />
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Tutor speech">
          {SPEECH_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 text-sm",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="tutor-speech-mode"
                value={opt.value}
                checked={speechMode === opt.value}
                onChange={() => onSpeechModeChange(opt.value)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
              />
              <span>
                <span className="block font-medium text-foreground">
                  {opt.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Direct audio delivery — only meaningful when voice input is on */}
      {audioSelected ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="direct-audio-input-toggle" className="text-sm">
                Send audio directly to the model
              </Label>
              <InfoTooltip text="Skips transcription and lets the tutor model hear the learner's actual voice, instead of reading a transcript. Voice-recognition quality may vary by language." />
            </div>
            {directCapabilityUnavailable ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2">
                      <Lock
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-label="Unavailable"
                      />
                      <Switch
                        id="direct-audio-input-toggle"
                        checked={directEnabled}
                        disabled
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {audioInputSupported === undefined
                      ? "Checking whether this class's AI model supports direct audio input…"
                      : "This class's configured AI model doesn't support direct audio input. Contact your administrator to enable it."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Switch
                id="direct-audio-input-toggle"
                checked={directEnabled}
                onCheckedChange={(on) =>
                  onAudioDeliveryChange(on ? "direct" : "transcribe")
                }
                disabled={disabled}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
