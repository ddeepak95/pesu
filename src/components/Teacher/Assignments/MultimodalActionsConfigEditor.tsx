"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BotPromptConfig } from "@/types/assignment";
import type { MultimodalActionsConfig } from "@/lib/multimodal/turnConfig";
import type { ActionKind } from "@/lib/multimodal/actions/types";

interface MultimodalActionsConfigEditorProps {
  config: BotPromptConfig;
  onChange: (config: BotPromptConfig) => void;
  disabled?: boolean;
}

export function MultimodalActionsConfigEditor({
  config,
  onChange,
  disabled,
}: MultimodalActionsConfigEditorProps) {
  const actions: MultimodalActionsConfig = config.multimodal_actions ?? {};
  const availableActions: ActionKind[] = actions.availableActions ?? [];

  const setAvailableActions = (kinds: ActionKind[]) => {
    onChange({
      ...config,
      multimodal_actions: { ...actions, availableActions: kinds },
    });
  };

  const mcqEnabled = availableActions.includes("mcq");
  const toggleMcq = (on: boolean) => {
    const next = on
      ? Array.from(new Set<ActionKind>([...availableActions, "mcq"]))
      : availableActions.filter((k) => k !== "mcq");
    setAvailableActions(next);
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="mcq-toggle" className="text-sm">
            Multiple choice questions
          </Label>
          <p className="text-xs text-muted-foreground">
            The tutor can pose an MCQ when it helps the learner.
          </p>
        </div>
        <Switch
          id="mcq-toggle"
          checked={mcqEnabled}
          onCheckedChange={toggleMcq}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
