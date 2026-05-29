"use client";

import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { listImplementedActions } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { MultimodalActionsConfig } from "@/lib/multimodal/turnConfig";
import type { BotPromptConfig } from "@/types/assignment";

interface MultimodalActionsConfigEditorProps {
  config: BotPromptConfig;
  onChange: (config: BotPromptConfig) => void;
  /**
   * Kinds whose content-generation model is configured + capable for this
   * class. Undefined = capability couldn't be resolved (e.g. no class context),
   * so don't gate.
   */
  availableActionKinds?: ActionKind[];
  disabled?: boolean;
}

export function MultimodalActionsConfigEditor({
  config,
  onChange,
  availableActionKinds,
  disabled,
}: MultimodalActionsConfigEditorProps) {
  const actions: MultimodalActionsConfig = config.multimodal_actions ?? {};
  const enabledActions: ActionKind[] = actions.availableActions ?? [];

  const setActionEnabled = (kind: ActionKind, on: boolean) => {
    const next = on
      ? Array.from(new Set<ActionKind>([...enabledActions, kind]))
      : enabledActions.filter((k) => k !== kind);
    onChange({
      ...config,
      multimodal_actions: { ...actions, availableActions: next },
    });
  };

  return (
    <div className="space-y-3">
      {listImplementedActions().map((action) => {
        const capable =
          availableActionKinds === undefined ||
          availableActionKinds.includes(action.kind);
        const checked = enabledActions.includes(action.kind) && capable;
        const toggleId = `action-toggle-${action.kind}`;

        return (
          <div key={action.kind} className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={toggleId} className="text-sm">
                    {action.label}
                  </Label>
                  {!capable && (
                    <InfoTooltip text="No configured model supports this action. Set a model for it in AI settings to enable it." />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </div>
              <Switch
                id={toggleId}
                checked={checked}
                onCheckedChange={(on) => setActionEnabled(action.kind, on)}
                disabled={disabled || !capable}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
