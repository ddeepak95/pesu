"use client";

import { Lock } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MultimodalAudioInputEditorProps {
  audioDelivery: "transcribe" | "direct";
  onAudioDeliveryChange: (audioDelivery: "transcribe" | "direct") => void;
  /**
   * Whether direct audio input is currently usable. Pass `true` when there's
   * no capability check to gate on (e.g. setting a template default, which
   * isn't bound to any one class's model). `undefined` while a check is still
   * loading — treated the same as `false` (disabled) until it resolves, since
   * we don't yet know it's safe to let the teacher turn this on. `false` once
   * a check has resolved and the model doesn't support it.
   */
  audioInputSupported?: boolean;
  disabled?: boolean;
}

export function MultimodalAudioInputEditor({
  audioDelivery,
  onAudioDeliveryChange,
  audioInputSupported,
  disabled,
}: MultimodalAudioInputEditorProps) {
  const directEnabled = audioDelivery === "direct";
  const capabilityUnavailable = audioInputSupported !== true;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="direct-audio-input-toggle" className="text-sm">
            Send audio directly to the model
          </Label>
          <InfoTooltip text="Skips transcription and lets the tutor model hear the learner's actual voice, instead of reading a transcript. Voice-recognition quality may vary by language." />
        </div>
        {capabilityUnavailable ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Unavailable" />
                  <Switch id="direct-audio-input-toggle" checked={directEnabled} disabled />
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
            onCheckedChange={(on) => onAudioDeliveryChange(on ? "direct" : "transcribe")}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
