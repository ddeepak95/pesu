"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { BotPromptConfig } from "@/types/assignment";
import type {
  EndConversationConfig,
  MultimodalActionsConfig,
} from "@/lib/multimodal/turnConfig";
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
  const endConversation: EndConversationConfig = actions.endConversation ?? {};

  const update = (next: MultimodalActionsConfig) => {
    onChange({ ...config, multimodal_actions: next });
  };

  const setAvailableActions = (kinds: ActionKind[]) => {
    update({ ...actions, availableActions: kinds });
  };

  const setEndConversation = (next: EndConversationConfig) => {
    update({ ...actions, endConversation: next });
  };

  const mcqEnabled = availableActions.includes("mcq");
  const toggleMcq = (on: boolean) => {
    const next = on
      ? Array.from(new Set<ActionKind>([...availableActions, "mcq"]))
      : availableActions.filter((k) => k !== "mcq");
    setAvailableActions(next);
  };

  return (
    <div className="space-y-5 rounded-lg border border-border p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          Interactive content
        </h4>
        <p className="text-xs text-muted-foreground">
          Choose which rich content the tutor may use during the conversation.
        </p>
      </div>

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

      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor="end-custom" className="text-sm">
          Ending the conversation
        </Label>
        <p className="text-xs text-muted-foreground">
          By default the tutor wraps up once the learner has engaged with and
          covered the topic, or if the learner goes off-topic or refuses to
          engage. Add any extra guidance below (optional).
        </p>
        <Textarea
          id="end-custom"
          placeholder="e.g. Wrap up once the student demonstrates understanding of the core idea."
          value={endConversation.customInstruction ?? ""}
          onChange={(e) =>
            setEndConversation({
              ...endConversation,
              customInstruction: e.target.value || undefined,
            })
          }
          disabled={disabled}
          rows={2}
        />
      </div>
    </div>
  );
}
