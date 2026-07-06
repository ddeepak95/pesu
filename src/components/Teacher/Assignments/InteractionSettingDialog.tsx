"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultimodalAudioInputEditor } from "@/components/Teacher/Assignments/MultimodalAudioInputEditor";

interface InteractionSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audioDelivery: "transcribe" | "direct";
  onAudioDeliveryChange: (audioDelivery: "transcribe" | "direct") => void;
  /** Pass `true` when there's no capability check to gate on (e.g. a template default). */
  audioInputSupported?: boolean;
  disabled?: boolean;
}

/**
 * How the learner and tutor exchange audio in this multimodal activity.
 * Shared by the assignment form (bound to that assignment's saved config) and
 * the activity-type template editor (bound to the template's default) —
 * intentionally shape-agnostic (primitive props, not BotPromptConfig) so both
 * can reuse it. Currently holds the direct-audio-input toggle; a home for
 * future interaction-level settings (e.g. speech output mode) as they're built.
 */
export function InteractionSettingDialog({
  open,
  onOpenChange,
  audioDelivery,
  onAudioDeliveryChange,
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
          audioDelivery={audioDelivery}
          onAudioDeliveryChange={onAudioDeliveryChange}
          audioInputSupported={audioInputSupported}
          disabled={disabled}
        />
      </DialogContent>
    </Dialog>
  );
}
