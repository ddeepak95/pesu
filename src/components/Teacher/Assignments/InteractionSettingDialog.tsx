"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MultimodalAudioInputEditor,
  type InputMode,
  type SpeechMode,
} from "@/components/Teacher/Assignments/MultimodalAudioInputEditor";

interface InteractionSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputModes: InputMode[];
  onInputModesChange: (modes: InputMode[]) => void;
  speechMode: SpeechMode;
  onSpeechModeChange: (mode: SpeechMode) => void;
  audioDelivery: "transcribe" | "direct";
  onAudioDeliveryChange: (audioDelivery: "transcribe" | "direct") => void;
  /** Whether learner audio input is usable at all (gates the "Voice" method). */
  audioInputAvailable?: boolean;
  /** Whether direct audio input is usable (gates the direct-audio toggle). */
  audioInputSupported?: boolean;
  disabled?: boolean;
}

/**
 * How the learner and tutor exchange input/output in this multimodal activity:
 * which input methods (text/voice) the learner may use, whether the tutor
 * speaks, and (for voice) whether audio goes straight to the model. Shared by
 * the assignment form (bound to that assignment's saved config) and the
 * activity-type template editor (bound to the template's default) —
 * intentionally shape-agnostic (primitive props, not BotPromptConfig) so both
 * can reuse it.
 */
export function InteractionSettingDialog({
  open,
  onOpenChange,
  inputModes,
  onInputModesChange,
  speechMode,
  onSpeechModeChange,
  audioDelivery,
  onAudioDeliveryChange,
  audioInputAvailable,
  audioInputSupported,
  disabled,
}: InteractionSettingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Multimodal Setting</DialogTitle>
        </DialogHeader>
        <MultimodalAudioInputEditor
          inputModes={inputModes}
          onInputModesChange={onInputModesChange}
          speechMode={speechMode}
          onSpeechModeChange={onSpeechModeChange}
          audioDelivery={audioDelivery}
          onAudioDeliveryChange={onAudioDeliveryChange}
          audioInputAvailable={audioInputAvailable}
          audioInputSupported={audioInputSupported}
          disabled={disabled}
        />
      </DialogContent>
    </Dialog>
  );
}
